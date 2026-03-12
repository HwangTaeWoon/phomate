import React from 'react';
import { X } from 'lucide-react';
import '../styles/Notification.css';

type UploadNotificationStatus = 'done' | 'error';

export type AppNotificationItem = {
    id: string;
    kind: 'upload' | 'folder' | 'shared_folder' | 'invite';
    title: string;
    message: string;
    createdAt: number;
    read: boolean;
    progress?: number;
    uploadStatus?: UploadNotificationStatus;
    errorMessage?: string;
};

type NotificationPanelProps = {
    onClose: () => void;
    onItemClick?: (item: AppNotificationItem) => void;
    notifications?: AppNotificationItem[];
};

function statusText(status: UploadNotificationStatus): string {
    if (status === 'done') return '업로드 완료';
    return '업로드 실패';
}

function formatTime(createdAt: number): string {
    return new Intl.DateTimeFormat('ko-KR', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(createdAt);
}

export default function NotificationPanel({ onClose, onItemClick, notifications = [] }: NotificationPanelProps) {
    return (
        <div className="noti-panel">
            <div className="noti-header">
                <span>알림</span>
                <button onClick={onClose} className="noti-close-x"><X size={16} /></button>
            </div>
            <div className="noti-body">
                {notifications.length === 0 ? (
                    <div className="noti-empty">
                        <p className="noti-empty-title">새 알림이 없습니다.</p>
                        <p className="noti-empty-message">업로드 완료나 폴더 변경 같은 이벤트가 생기면 여기에 표시됩니다.</p>
                    </div>
                ) : (
                    <div className="upload-item-list">
                        {notifications.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`noti-item ${!item.read ? 'unread' : ''}`}
                                onClick={() => onItemClick?.(item)}
                            >
                                <div className="noti-item-body">
                                    <div className="noti-item-title-row">
                                        <p className="noti-item-title">{item.title}</p>
                                        <div className="noti-item-meta">
                                            {!item.read ? <span className="noti-unread-dot" /> : null}
                                            <span className="noti-item-time">{formatTime(item.createdAt)}</span>
                                        </div>
                                    </div>
                                    <p className="noti-item-message">{item.message}</p>
                                    {item.uploadStatus ? (
                                        <div className="noti-upload-section">
                                            <div className="upload-item-title-row">
                                                <span className={`upload-item-status ${item.uploadStatus}`}>{statusText(item.uploadStatus)}</span>
                                            </div>
                                            <div className="upload-progress-container">
                                                <div className="upload-progress-fill" style={{ width: `${item.progress ?? 0}%` }}></div>
                                            </div>
                                            {item.errorMessage ? <p className="upload-error-text">{item.errorMessage}</p> : null}
                                        </div>
                                    ) : null}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}