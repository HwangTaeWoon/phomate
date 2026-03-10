import React, { useEffect, useState } from 'react';
import PhotoCard from './Photocard';
import ActionModal from './Actionmodal';
import { Photo } from '../types';
import { getTrashLatest, purgePhoto, restorePhoto } from '../api/photo';
import '../styles/TrashView.css';

type TrashViewProps = {
    isLoggedIn: boolean;
    onChanged?: () => void;
};

export default function TrashView({ isLoggedIn, onChanged }: TrashViewProps) {
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [modalConfig, setModalConfig] = useState<{type: 'restore' | 'delete_confirm' | 'alert', message: string} | null>(null);
    const [trashPhotos, setTrashPhotos] = useState<Photo[]>([]);

    const loadTrash = async () => {
        if (!isLoggedIn) {
            setTrashPhotos([]);
            return;
        }

        try {
            const items = await getTrashLatest({ size: 60 });
            setTrashPhotos(items.map((item) => ({
                id: String(item.photoId),
                thumbnailUrl: item.thumbnailUrl || item.previewUrl,
                previewUrl: item.previewUrl,
                shotAt: item.shotAt,
                likeCount: 0
            })));
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '휴지통을 불러오지 못했습니다.';
            window.alert(message);
        }
    };

    useEffect(() => {
        void loadTrash();
    }, [isLoggedIn]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleAction = (actionType: 'restore' | 'delete') => {
        if (selectedIds.length === 0) return;
        if (actionType === 'restore') {
            setModalConfig({ type: 'restore', message: '선택한 사진을 복구하시겠습니까?' });
        } else {
            setModalConfig({ type: 'delete_confirm', message: '삭제하시겠습니까?' });
        }
    };

    const executeRestore = async () => {
        for (const id of selectedIds) {
            const photoId = Number(id);
            if (!Number.isFinite(photoId) || photoId <= 0) continue;
            await restorePhoto(photoId);
        }

        setModalConfig({ type: 'alert', message: '복구되었습니다.' });
        setIsSelectMode(false);
        setSelectedIds([]);
        await loadTrash();
        if (onChanged) onChanged();
    };

    const executePurge = async () => {
        for (const id of selectedIds) {
            const photoId = Number(id);
            if (!Number.isFinite(photoId) || photoId <= 0) continue;
            await purgePhoto(photoId);
        }

        setModalConfig({ type: 'alert', message: '삭제되었습니다.' });
        setIsSelectMode(false);
        setSelectedIds([]);
        await loadTrash();
        if (onChanged) onChanged();
    };

    return (
        <div className="trash-view-container">
            <div className="photo-grid">
                {trashPhotos.map((photo) => (
                    <PhotoCard 
                        key={photo.id} 
                        photo={photo} 
                        isSelectMode={isSelectMode}
                        isSelected={selectedIds.includes(photo.id)}
                        onSelect={() => toggleSelect(photo.id)}
                    />
                ))}
            </div>

            {/* 하단 플로팅 액션 바: PHOMATE 스타일 적용 */}
            <div className="trash-bottom-controls">
                {!isSelectMode ? (
                    <button className="trash-select-btn" onClick={() => setIsSelectMode(true)}>선택</button>
                ) : (
                    <div className="trash-action-group">
                        <span className="trash-count">{selectedIds.length}개 선택</span>
                        <button className="trash-btn restore" onClick={() => handleAction('restore')}>복구</button>
                        <button className="trash-btn delete" onClick={() => handleAction('delete')}>삭제</button>
                        <button className="trash-btn cancel" onClick={() => {setIsSelectMode(false); setSelectedIds([]);}}>취소</button>
                    </div>
                )}
            </div>

            {modalConfig && (
                <ActionModal 
                    config={modalConfig} 
                    onClose={() => setModalConfig(null)}
                    onConfirm={() => {
                        const run = async () => {
                            if (modalConfig.type === 'restore') {
                                await executeRestore();
                                return;
                            }

                            if (modalConfig.type === 'delete_confirm') {
                                await executePurge();
                                return;
                            }

                            setModalConfig(null);
                        };

                        void run().catch((error: unknown) => {
                            const message = error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
                            window.alert(message);
                            setModalConfig(null);
                        });
                    }}
                />
            )}
        </div>
    );
}