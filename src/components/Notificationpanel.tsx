import React from 'react';
import { X } from 'lucide-react';
import '../styles/Notification.css';

type UploadNotificationItem = {
    id: string;
    filename: string;
    progress: number;
    status: 'queued' | 'uploading' | 'processing' | 'done' | 'error';
    errorMessage?: string;
};

type NotificationPanelProps = {
    onClose: () => void;
    onItemClick: () => void;
    uploadItems?: UploadNotificationItem[];
};

function statusText(status: UploadNotificationItem['status']): string {
    if (status === 'queued') return '대기중';
    if (status === 'uploading') return '업로드중';
    if (status === 'processing') return '후처리중';
    if (status === 'done') return '업로드 완료';
    return '업로드 실패';
}

export default function NotificationPanel({ onClose, onItemClick, uploadItems = [] }: NotificationPanelProps) {
    return (
        <div className="noti-panel">
            <div className="noti-header">
                <span>알림</span>
                <button onClick={onClose} className="noti-close-x"><X size={16} /></button>
            </div>
            <div className="noti-body">
                <div className="noti-item" onClick={onItemClick}>
                    <p>• 공유 앨범 3에 초대되었습니다</p>
                    <span className="noti-more">•••</span>
                </div>
                {uploadItems.length > 0 ? (
                    <div className="noti-upload-section">
                        <p className="noti-upload-title">업로드 알림</p>
                        <div className="upload-item-list">
                            {uploadItems.map((item) => (
                                <div key={item.id} className="upload-item-row">
                                    <div className="upload-item-title-row">
                                        <p className="upload-filename">{item.filename}</p>
                                        <span className={`upload-item-status ${item.status}`}>{statusText(item.status)}</span>
                                    </div>
                                    <div className="upload-progress-container">
                                        <div className="upload-progress-fill" style={{ width: `${item.progress}%` }}></div>
                                    </div>
                                    {item.errorMessage ? (
                                        <p className="upload-error-text">{item.errorMessage}</p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}