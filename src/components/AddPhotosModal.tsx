import React from 'react';
import { X } from 'lucide-react';
import { Photo } from '../types';
import '../styles/AddPhotosModal.css';

type AddPhotosModalProps = {
    folderName: string;
    photos: Photo[];
    selectedPhotoIds: string[];
    existingPhotoIds: Set<string>;
    onToggle: (photoId: string) => void;
    onClose: () => void;
    onSubmit: () => void;
};

export default function AddPhotosModal({
    folderName,
    photos,
    selectedPhotoIds,
    existingPhotoIds,
    onToggle,
    onClose,
    onSubmit
}: AddPhotosModalProps) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="add-photos-modal" onClick={(event) => event.stopPropagation()}>
                <div className="add-photos-header">
                    <div>
                        <h2 className="add-photos-title">사진 추가</h2>
                        <p className="add-photos-subtitle">'{folderName}'에 추가할 사진을 선택하세요.</p>
                    </div>
                    <button className="close-icon-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="add-photos-body">
                    {photos.length === 0 ? (
                        <p className="add-photos-empty">홈에 사진이 없어 추가할 수 없습니다.</p>
                    ) : (
                        <div className="add-photos-grid">
                            {photos.map((photo) => {
                                const isAlreadyIncluded = existingPhotoIds.has(photo.id);
                                const isSelected = selectedPhotoIds.includes(photo.id);

                                return (
                                    <button
                                        key={photo.id}
                                        type="button"
                                        className={`add-photo-item ${isSelected ? 'selected' : ''}`}
                                        onClick={() => onToggle(photo.id)}
                                        disabled={isAlreadyIncluded}
                                    >
                                        <img src={photo.thumbnailUrl} alt="추가할 사진" />
                                        <div className="add-photo-item-footer">
                                            {isAlreadyIncluded ? '이미 추가됨' : (isSelected ? '선택됨' : '선택')}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="add-photos-footer">
                    <span className="add-photos-count">{selectedPhotoIds.length}장 선택됨</span>
                    <button
                        type="button"
                        className="add-photos-submit-btn"
                        disabled={selectedPhotoIds.length === 0}
                        onClick={onSubmit}
                    >
                        선택 사진 추가
                    </button>
                </div>
            </div>
        </div>
    );
}
