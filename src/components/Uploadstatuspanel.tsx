import React from 'react';
import '../styles/Notification.css';

type UploadPanelItem = {
    id: string;
    filename: string;
    progress: number;
    status: 'queued' | 'uploading' | 'processing' | 'done' | 'error';
    errorMessage?: string;
};

type UploadStatusPanelProps = {
    items: UploadPanelItem[];
};

function statusLabel(status: UploadPanelItem['status']): string {
    if (status === 'queued') return '대기중';
    if (status === 'uploading') return '업로드중';
    if (status === 'processing') return '처리중';
    if (status === 'done') return '완료';
    return '실패';
}

export default function UploadStatusPanel({ items }: UploadStatusPanelProps) {
    const activeCount = items.filter((item) => item.status !== 'done' && item.status !== 'error').length;
    const averageProgress = items.length
        ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length)
        : 0;

    return (
        <div className="noti-panel upload-status">
            <div className="noti-header">
                <span>업로드 진행</span>
                <span className="progress-percent">{averageProgress}%</span>
            </div>
            <div className="noti-body">
                <p className="upload-summary-text">활성 작업 {activeCount}개 / 전체 {items.length}개</p>
                <div className="upload-item-list">
                    {items.map((item) => (
                        <div key={item.id} className="upload-item-row">
                            <div className="upload-item-title-row">
                                <p className="upload-filename">{item.filename}</p>
                                <span className={`upload-item-status ${item.status}`}>{statusLabel(item.status)}</span>
                            </div>
                            <div className="upload-progress-container">
                                <div className="upload-progress-fill" style={{ width: `${item.progress}%` }}></div>
                            </div>
                            {item.errorMessage ? <p className="upload-error-text">{item.errorMessage}</p> : null}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}