import React, { useEffect, useRef, useState } from 'react';
import { X, Edit3, Undo, Redo, Save } from 'lucide-react';
import { sendEditChat, startChatSession, streamSearchChat, streamTextChat } from '../api/chat';
import '../styles/Chatbot.css';

type ChatTab = 'search' | 'edit';
type ChatRole = 'assistant' | 'user';

type ChatMessage = {
    id: string;
    role: ChatRole;
    content: string;
};

type ChatbotProps = {
    isOpen: boolean;
    onClose: () => void;
    onOpen: () => void;
};

export default function Chatbot({ isOpen, onClose, onOpen }: ChatbotProps) {
    const [activeTab, setActiveTab] = useState<'search' | 'edit'>('search');
    const [sessionId, setSessionId] = useState<number | null>(null);
    const [editSessionId] = useState<number>(1);
    const [messages, setMessages] = useState<ChatMessage[]>([
        { id: 'initial-assistant', role: 'assistant', content: '사진에 대한 설명을 적어주세요.' }
    ]);
    const [editAssistantContent, setEditAssistantContent] = useState('');
    const [editedImageUrl, setEditedImageUrl] = useState('');
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const bodyRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen || sessionId) return;

        let mounted = true;
        startChatSession()
            .then((id) => {
                if (mounted) setSessionId(id);
            })
            .catch((error: unknown) => {
                if (!mounted) return;
                const message = error instanceof Error ? error.message : '세션을 시작할 수 없습니다.';
                setErrorMessage(message);
            });

        return () => {
            mounted = false;
        };
    }, [isOpen, sessionId]);

    useEffect(() => {
        if (!bodyRef.current) return;
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [messages, errorMessage]);

    const ensureSessionId = async (): Promise<number> => {
        if (sessionId !== null) return sessionId;
        const newSessionId = await startChatSession();
        setSessionId(newSessionId);
        return newSessionId;
    };

    const appendMessage = (role: ChatRole, content: string): string => {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setMessages((prev) => [...prev, { id, role, content }]);
        return id;
    };

    const updateMessage = (targetId: string, content: string) => {
        setMessages((prev) => prev.map((message) => (
            message.id === targetId ? { ...message, content } : message
        )));
    };

    const isSearchIntent = (text: string): boolean => {
        const normalized = text.trim().toLocaleLowerCase();
        if (!normalized) return false;

        const searchKeywords = ['검색', '찾아', '사진', '이미지', 'show me', 'find'];
        return searchKeywords.some((keyword) => normalized.includes(keyword));
    };

    const isDemoStreamInput = (text: string): boolean => {
        const normalized = text.trim().toLocaleLowerCase();
        return normalized === '/stream-test' || normalized.includes('스트리밍 테스트');
    };

    const streamDemoAssistantMessage = async (assistantMessageId: string): Promise<void> => {
        const chunks = [
            '따뜻한 ',
            '노을이 ',
            '비친 ',
            '바다 ',
            '사진을 ',
            '찾았어요. ',
            '마음에 ',
            '드는 ',
            '분위기를 ',
            '골라서 ',
            '알려주시면 ',
            '더 ',
            '정확히 ',
            '추천해드릴게요.'
        ];

        let streamed = '';
        for (const chunk of chunks) {
            streamed += chunk;
            updateMessage(assistantMessageId, streamed);
            await new Promise<void>((resolve) => {
                window.setTimeout(() => resolve(), 70);
            });
        }
    };

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isSending) return;

        setErrorMessage('');
        setInput('');
        appendMessage('user', trimmed);
        setIsSending(true);

        try {
            const currentSessionId = await ensureSessionId();

            if (activeTab === 'search') {
                const assistantMessageId = appendMessage('assistant', '');
                let streamedText = '';

                if (isDemoStreamInput(trimmed)) {
                    await streamDemoAssistantMessage(assistantMessageId);
                    return;
                }

                const useSearchStream = isSearchIntent(trimmed);

                const handleDelta = (delta: string) => {
                    streamedText += delta;
                    updateMessage(assistantMessageId, streamedText);
                };

                if (useSearchStream) {
                    await streamSearchChat({
                        sessionId: currentSessionId,
                        message: trimmed,
                        onDelta: handleDelta
                    });
                } else {
                    await streamTextChat({
                        sessionId: currentSessionId,
                        message: trimmed,
                        onDelta: handleDelta,
                        onError: (code) => {
                            setErrorMessage(`스트리밍 오류: ${code}`);
                        }
                    });
                }

                if (!streamedText) {
                    updateMessage(assistantMessageId, '응답이 비어 있습니다.');
                }
            } else {
                const reply = await sendEditChat({
                    chatSessionId: currentSessionId,
                    editSessionId,
                    userText: trimmed
                });
                const nextText = reply.assistantContent || '편집 응답이 비어 있습니다.';
                appendMessage('assistant', nextText);
                setEditAssistantContent(nextText);
                if (reply.editedUrl) {
                    setEditedImageUrl(reply.editedUrl);
                }
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '메시지 전송 중 오류가 발생했습니다.';
            setErrorMessage(message);
        } finally {
            setIsSending(false);
        }
    };

    const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            void handleSend();
        }
    };

    if (!isOpen) {
        return (
            <button className="chatbot-open-trigger" onClick={onOpen}>
                챗봇 열기
            </button>
        );
    }

    return (
        <aside className="chatbot-container">
            <div className="chatbot-window">
                {/* 1. 상단 탭 헤더 */}
                <div className="chatbot-header">
                    <div className="tabs">
                        <button 
                            className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`} 
                            onClick={() => setActiveTab('search')}
                        >
                            검색
                        </button>
                        <button 
                            className={`tab-btn edit ${activeTab === 'edit' ? 'active' : ''}`} 
                            onClick={() => setActiveTab('edit')}
                        >
                            편집
                        </button>
                    </div>
                    <button className="panel-close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* 2. 메인 바디 */}
                <div className="chatbot-body" ref={bodyRef}>
                    {activeTab === 'search' ? (
                        <div className="chat-view scroll-hide">
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={message.role === 'assistant' ? 'msg-bubble-bot' : 'msg-bubble-user'}
                                >
                                    {message.content || '...'}
                                </div>
                            ))}
                            {errorMessage ? (
                                <div className="chat-error-text">{errorMessage}</div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="edit-view">
                            <div className="edit-preview-area">
                                {editedImageUrl ? (
                                    <img src={editedImageUrl} alt="편집 결과" className="edit-preview-image" />
                                ) : (
                                    <p className="preview-placeholder">편집할 이미지를 선택해주세요.</p>
                                )}
                            </div>
                            {editAssistantContent ? (
                                <div className="edit-result-text">{editAssistantContent}</div>
                            ) : null}
                            {/* 편집 툴바 */}
                            <div className="edit-toolbar">
                                <button className="tool-btn"><Undo size={16} /></button>
                                <button className="tool-btn"><Redo size={16} /></button>
                                <button className="tool-btn direct-edit">
                                    <Edit3 size={14} /> 직접 편집
                                </button>
                            </div>
                            <button className="save-finish-btn">
                                <Save size={16} /> 저장 및 종료
                            </button>
                        </div>
                    )}
                </div>

                {/* 3. 하단 입력창 */}
                <div className="chatbot-footer">
                    <div className="input-field-pill">
                        <input
                            type="text"
                            placeholder={isSending ? '응답 생성 중...' : '메시지를 입력하세요...'}
                            className="chat-input"
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={handleInputKeyDown}
                            disabled={isSending}
                        />
                        <button className="chat-send-btn" onClick={() => void handleSend()} disabled={isSending}>
                            {isSending ? '전송중' : '전송'}
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );
}