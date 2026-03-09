import React, { useState } from 'react';
import { X, UploadCloud } from 'lucide-react';
import '../styles/UploadModal.css';

type UploadModalProps = {
    onClose: () => void;
    onStart: (files: File[]) => void;
};

export default function UploadModal({ onClose, onStart }: UploadModalProps) {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        setSelectedFiles(files);
    };

    const handleStart = () => {
        if (selectedFiles.length === 0) return;
        onStart(selectedFiles);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
                <button className="modal-top-close" onClick={onClose}><X size={20} /></button>
                <div className="upload-modal-content">
                    <UploadCloud size={48} color="#003366" />
                    <h2>새로운 사진 업로드</h2>
                    <p>기기에 있는 사진을 선택하거나 드래그하세요.</p>
                    <div className="upload-dropzone">
                        <input type="file" id="file-input" hidden multiple accept="image/*" onChange={handleFileChange} />
                        <label htmlFor="file-input" className="file-label">파일 선택</label>
                        {selectedFiles.length > 0 ? (
                            <>
                                <p className="upload-file-summary">{selectedFiles.length}개 파일 선택됨</p>
                                <ul className="upload-file-list">
                                    {selectedFiles.map((file) => (
                                        <li key={`${file.name}-${file.lastModified}`} className="upload-file-item">
                                            {file.name}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                    </div>
                    <button className="upload-start-btn" onClick={handleStart} disabled={selectedFiles.length === 0}>
                        업로드 시작
                    </button>
                </div>
            </div>
        </div>
    );
}