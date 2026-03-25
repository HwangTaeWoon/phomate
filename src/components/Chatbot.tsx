import React, { useEffect, useRef, useState } from 'react';
import { X, Undo, Redo, Save } from 'lucide-react';
import {
    type ChatFolderPreviewPhoto,
    confirmAutoFolder,
    previewAutoFolder,
    startChatSession,
    streamTextChat
} from '../api/chat';
import {
    startEditSession,
    getCurrentEditVersion,
    undoEdit,
    redoEdit,
    sendEditChat,
    finalizeEdit
} from '../api/edit';
import '../styles/Chatbot.css';

type ChatTab = 'search' | 'edit';
type ChatRole = 'assistant' | 'user';

type ChatMessage = {
    id: string;
    role: ChatRole;
    content: string;
};

type FolderPreviewState = {
    folderName: string;
    photoIds: number[];
    status: 'pending' | 'accepted' | 'rejected';
};

type ChatbotProps = {
    isOpen: boolean;
    onClose: () => void;
    onOpen: () => void;
    isLoggedIn: boolean;
    selectedPhotoId?: number | null;
    onSearchResults?: (payload: { query: string; photos: ChatFolderPreviewPhoto[] }) => void;
    onSessionStart?: (id: number) => void;
    onFolderCreated?: (name: string, photoIds: number[]) => void;
};

const INITIAL_SEARCH_MESSAGES: ChatMessage[] = [
    { id: 'initial-assistant', role: 'assistant', content: '사진에 대한 설명을 적어주세요.' }
];

const INITIAL_EDIT_MESSAGES: ChatMessage[] = [
    {
        id: 'initial-edit-assistant',
        role: 'assistant',
        content: '편집할 사진을 선택하거나 이미지를 드래그해서 올려주세요.'
    }
];

export default function Chatbot({
    isOpen,
    onClose,
    onOpen,
    isLoggedIn,
    selectedPhotoId,
    onSessionStart,
    onFolderCreated
}: ChatbotProps) {
    const isGuestChatMode = import.meta.env.VITE_CHAT_GUEST_MODE === 'true';
    const [activeTab, setActiveTab] = useState<ChatTab>('search');

    const [sessionId, setSessionId] = useState<number | null>(null);
    const sessionIdRef = useRef<number | null>(null);

    const [editSessionId, setEditSessionId] = useState<number | null>(null);
    const editSessionIdRef = useRef<number | null>(null);
    const [isEditSessionLoading, setIsEditSessionLoading] = useState(false);
    const editSessionPhotoIdRef = useRef<number | null>(null);

    const [searchMessages, setSearchMessages] = useState<ChatMessage[]>(INITIAL_SEARCH_MESSAGES);
    const [editMessages, setEditMessages] = useState<ChatMessage[]>(INITIAL_EDIT_MESSAGES);

    const [editedImageUrl, setEditedImageUrl] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [folderPreview, setFolderPreview] = useState<FolderPreviewState | null>(null);
    const [isEditDragOver, setIsEditDragOver] = useState(false);

    const bodyRef = useRef<HTMLDivElement | null>(null);
    const editChatRef = useRef<HTMLDivElement | null>(null);
    const localEditPreviewUrlRef = useRef<string | null>(null);

    const setSessionIdSync = (id: number) => {
        sessionIdRef.current = id;
        setSessionId(id);
    };

    const setEditSessionIdSync = (id: number) => {
        editSessionIdRef.current = id;
        setEditSessionId(id);
    };

    // 편집 상태 초기화
    const resetEditState = () => {
        editSessionIdRef.current = null;
        editSessionPhotoIdRef.current = null;
        setEditSessionId(null);
        setEditedImageUrl('');
        setEditMessages([...INITIAL_EDIT_MESSAGES]);
        setErrorMessage('');
        if (localEditPreviewUrlRef.current) {
            URL.revokeObjectURL(localEditPreviewUrlRef.current);
            localEditPreviewUrlRef.current = null;
        }
    };

    // X버튼 — 전체 초기화 후 닫기
    const handleClose = () => {
        setSearchMessages([...INITIAL_SEARCH_MESSAGES]);
        setFolderPreview(null);
        setInput('');
        setErrorMessage('');
        sessionIdRef.current = null;
        setSessionId(null);
        resetEditState();
        onClose();
    };

    const handleTabChange = (tab: ChatTab) => {
        setActiveTab(tab);
        setErrorMessage('');
    };

    // 채팅 세션 초기화
    useEffect(() => {
        if (!isOpen || sessionIdRef.current !== null) return;
        if (!isGuestChatMode && !isLoggedIn) {
            setErrorMessage('로그인 후 챗봇을 사용할 수 있습니다.');
            return;
        }
        let mounted = true;
        startChatSession()
            .then((id) => {
                if (!mounted) return;
                setSessionIdSync(id);
                if (onSessionStart) onSessionStart(id);
            })
            .catch((error: unknown) => {
                if (!mounted) return;
                setErrorMessage(error instanceof Error ? error.message : '세션을 시작할 수 없습니다.');
            });
        return () => { mounted = false; };
    }, [isGuestChatMode, isLoggedIn, isOpen, onSessionStart]);

    // selectedPhotoId로 편집 세션 자동 시작
    useEffect(() => {
        if (!isOpen || activeTab !== 'edit' || !isLoggedIn || !selectedPhotoId) return;
        if (editSessionPhotoIdRef.current === selectedPhotoId && editSessionIdRef.current !== null) return;
        if (isEditSessionLoading) return;

        setIsEditSessionLoading(true);
        setErrorMessage('');
        editSessionPhotoIdRef.current = selectedPhotoId;

        startEditSession(selectedPhotoId)
            .then((res) => {
                setEditSessionIdSync(res.editSessionId);
                return getCurrentEditVersion(res.editSessionId);
            })
            .then((ver) => {
                if (ver.imageUrl) setEditedImageUrl(ver.imageUrl);
                appendEditMessage('assistant', '원본 이미지를 불러왔습니다. 편집 명령을 입력해주세요.');
            })
            .catch((error: unknown) => {
                editSessionPhotoIdRef.current = null;
                setErrorMessage(error instanceof Error ? error.message : '편집 세션을 시작할 수 없습니다.');
            })
            .finally(() => setIsEditSessionLoading(false));
    }, [isOpen, activeTab, isLoggedIn, selectedPhotoId, isEditSessionLoading]);

    // 검색 탭 스크롤
    useEffect(() => {
        if (!bodyRef.current) return;
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [searchMessages, errorMessage]);

    // 편집 탭 스크롤
    useEffect(() => {
        if (!editChatRef.current) return;
        editChatRef.current.scrollTop = editChatRef.current.scrollHeight;
    }, [editMessages]);

    // ObjectURL 정리
    useEffect(() => {
        return () => {
            if (localEditPreviewUrlRef.current) URL.revokeObjectURL(localEditPreviewUrlRef.current);
        };
    }, []);

    const ensureSessionId = async (): Promise<number> => {
        if (sessionIdRef.current !== null && sessionIdRef.current > 0) return sessionIdRef.current;
        const newId = await startChatSession();
        setSessionIdSync(newId);
        if (onSessionStart) onSessionStart(newId);
        return newId;
    };

    const ensureEditSessionId = (): number => {
        if (editSessionIdRef.current !== null) return editSessionIdRef.current;
        throw new Error('편집 세션이 준비되지 않았습니다.');
    };

    const updateSearchMessage = (targetId: string, content: string) => {
        setSearchMessages((prev) => prev.map((m) => (m.id === targetId ? { ...m, content } : m)));
    };

    const appendSearchMessage = (role: ChatRole, content: string): string => {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setSearchMessages((prev) => [...prev, { id, role, content }]);
        return id;
    };

    const appendEditMessage = (role: ChatRole, content: string): string => {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setEditMessages((prev) => [...prev, { id, role, content }]);
        return id;
    };

    const extractPhotoIdFromUrl = (url: string): number | null => {
        const match = url.match(/\/photos\/(\d+)\//);
        return match ? Number(match[1]) : null;
    };

    const startEditSessionFromUrl = (photoId: number) => {
        setIsEditSessionLoading(true);
        startEditSession(photoId)
            .then((res) => {
                setEditSessionIdSync(res.editSessionId);
                appendEditMessage('assistant', '편집 세션이 준비되었습니다.');
            })
            .catch(() => setErrorMessage('세션 시작 실패'))
            .finally(() => setIsEditSessionLoading(false));
    };

    const applyDroppedEditImage = (file: File) => {
        if (!file.type.startsWith('image/')) return;
        resetEditState(); // ✅ 기존 편집 내용 초기화
        const objectUrl = URL.createObjectURL(file);
        localEditPreviewUrlRef.current = objectUrl;
        setEditedImageUrl(objectUrl);
        appendEditMessage('assistant', '새 이미지가 적용되었습니다. 편집 명령을 입력해주세요.');
    };

    const handleEditDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsEditDragOver(false);

        const files = Array.from(event.dataTransfer.files);
        const imageFile = files.find((f) => f.type.startsWith('image/'));
        if (imageFile) { applyDroppedEditImage(imageFile); return; }

        const url = event.dataTransfer.getData('text/uri-list')?.split('\n')[0];
        if (url) {
            resetEditState(); // ✅ URL 드롭도 초기화
            setEditedImageUrl(url);
            appendEditMessage('assistant', '새 이미지가 적용되었습니다. 편집 명령을 입력해주세요.');
            const photoId = extractPhotoIdFromUrl(url);
            if (photoId) startEditSessionFromUrl(photoId);
        }
    };

    const handleFolderConfirm = async (accepted: boolean) => {
        if (!folderPreview || folderPreview.status !== 'pending') return;
        setIsSending(true);
        try {
            const res = await confirmAutoFolder({
                accepted,
                folderName: folderPreview.folderName,
                photoIds: folderPreview.photoIds
            });
            if (accepted && onFolderCreated) onFolderCreated(folderPreview.folderName, folderPreview.photoIds);
            setFolderPreview((prev) => prev ? { ...prev, status: accepted ? 'accepted' : 'rejected' } : null);
            appendSearchMessage('assistant', accepted ? `폴더 생성 완료. (ID: ${res.folderId})` : '취소되었습니다.');
        } catch {
            setErrorMessage('오류 발생');
        } finally {
            setIsSending(false);
        }
    };

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isSending) return;
        setInput('');
        setIsSending(true);
        setErrorMessage('');

        try {
            if (activeTab === 'search') {
                appendSearchMessage('user', trimmed);
                const curId = await ensureSessionId();
                if (['폴더', '분류', '정리'].some((k) => trimmed.includes(k))) {
                    const preview = await previewAutoFolder({ chatSessionId: curId, userText: trimmed });
                    setFolderPreview({
                        folderName: preview.suggestedFolderName,
                        photoIds: preview.photos.map((p) => p.photoId),
                        status: 'pending'
                    });
                    appendSearchMessage('assistant', `추천 폴더명: ${preview.suggestedFolderName}\n생성하시겠습니까?`);
                } else {
                    const msgId = appendSearchMessage('assistant', '');
                    let streamed = '';
                    await streamTextChat({
                        sessionId: curId,
                        message: trimmed,
                        onDelta: (d) => { streamed += d; updateSearchMessage(msgId, streamed); }
                    });
                }
            } else {
                appendEditMessage('user', trimmed);
                const curId = await ensureSessionId();
                const editId = ensureEditSessionId();
                const res = await sendEditChat(curId, editId, trimmed);
                appendEditMessage('assistant', res.assistantContent ?? '편집이 완료되었습니다.');
                if (res.editedUrl) setEditedImageUrl(res.editedUrl);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : '전송 실패';
            setErrorMessage(msg);
            if (activeTab === 'edit') appendEditMessage('assistant', `⚠️ ${msg}`);
        } finally {
            setIsSending(false);
        }
    };

    const handleUndo = async () => {
        if (!editSessionIdRef.current) return;
        try {
            const res = await undoEdit(editSessionIdRef.current);
            setEditedImageUrl(res.imageUrl);
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : '실행 취소 실패');
        }
    };

    const handleRedo = async () => {
        if (!editSessionIdRef.current) return;
        try {
            const res = await redoEdit(editSessionIdRef.current);
            setEditedImageUrl(res.imageUrl);
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : '다시 실행 실패');
        }
    };

    // ✅ 저장및종료 — 이미지 다운로드 후 챗봇 닫기
    const handleSaveAndExit = async () => {
        if (!editSessionIdRef.current) return;
        setIsSaving(true);
        try {
            const finalUrl = await finalizeEdit(editSessionIdRef.current);

            // 이미지 다운로드
            const link = document.createElement('a');
            link.href = finalUrl;
            link.download = `phomate_edit_${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // 챗봇 닫기 (전체 초기화 포함)
            handleClose();
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : '저장 실패');
        } finally {
            setIsSaving(false);
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
                {/* 헤더 */}
                <div className="chatbot-header">
                    <div className="tabs">
                        <button
                            className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
                            onClick={() => handleTabChange('search')}
                        >
                            검색
                        </button>
                        <button
                            className={`tab-btn edit ${activeTab === 'edit' ? 'active' : ''}`}
                            onClick={() => handleTabChange('edit')}
                        >
                            편집
                        </button>
                    </div>
                    <button className="panel-close-btn" onClick={handleClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* 바디 */}
                <div className="chatbot-body" ref={activeTab === 'search' ? bodyRef : undefined}>
                    {activeTab === 'search' ? (
                        // ── 검색 탭
                        <div className="chat-view scroll-hide">
                            {searchMessages.map((m) => (
                                <div
                                    key={m.id}
                                    className={m.role === 'assistant' ? 'msg-bubble-bot' : 'msg-bubble-user'}
                                >
                                    {m.content}
                                </div>
                            ))}
                            {folderPreview?.status === 'pending' && (
                                <div className="folder-preview-actions">
                                    <button className="folder-preview-btn accept" onClick={() => handleFolderConfirm(true)}>수락</button>
                                    <button className="folder-preview-btn reject" onClick={() => handleFolderConfirm(false)}>거절</button>
                                </div>
                            )}
                        </div>
                    ) : (
                        // ── 편집 탭
                        <div className="edit-view">
                            {/* 이미지 프리뷰 */}
                            <div
                                className={`edit-preview-area ${isEditDragOver ? 'drag-over' : ''}`}
                                onDragOver={(e) => { e.preventDefault(); setIsEditDragOver(true); }}
                                onDragEnter={() => setIsEditDragOver(true)}
                                onDragLeave={() => setIsEditDragOver(false)}
                                onDrop={handleEditDrop}
                            >
                                {isEditSessionLoading ? (
                                    <p className="preview-placeholder">준비 중...</p>
                                ) : editedImageUrl ? (
                                    <img src={editedImageUrl} alt="Preview" className="edit-preview-image" />
                                ) : (
                                    <p className="preview-placeholder">이미지를 드래그해서 올려주세요.</p>
                                )}
                            </div>

                            {/* ✅ 대화창 — 스크롤 가능 */}
                            <div className="edit-chat-view" ref={editChatRef}>
                                {editMessages.map((m) => (
                                    <div
                                        key={m.id}
                                        className={m.role === 'assistant' ? 'msg-bubble-bot' : 'msg-bubble-user'}
                                    >
                                        {m.content}
                                    </div>
                                ))}
                            </div>

                            {/* ✅ 하단 고정: Undo/Redo + 저장및종료 */}
                            <div className="edit-bottom">
                                <div className="edit-toolbar">
                                    <button className="tool-btn" onClick={handleUndo} title="실행 취소">
                                        <Undo size={16} />
                                    </button>
                                    <button className="tool-btn" onClick={handleRedo} title="다시 실행">
                                        <Redo size={16} />
                                    </button>
                                </div>
                                <button
                                    className="save-finish-btn"
                                    onClick={handleSaveAndExit}
                                    disabled={isSaving}
                                >
                                    <Save size={16} />
                                    {isSaving ? '저장 중...' : '저장 및 종료'}
                                </button>
                            </div>
                        </div>
                    )}
                    {errorMessage && <div className="chat-error-text">{errorMessage}</div>}
                </div>

                {/* 푸터 입력창 */}
                <div className="chatbot-footer">
                    <div className="input-field-pill">
                        <input
                            className="chat-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="메시지를 입력하세요..."
                        />
                        <button className="chat-send-btn" onClick={handleSend} disabled={isSending}>
                            {isSending ? '...' : '전송'}
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );
}
