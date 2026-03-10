import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import Chatbot from '../components/Chatbot';
import PhotoCard from '../components/Photocard';
import PhotoPreview from '../components/Photopreview';
import FolderView from '../components/Folderview';
import FolderModal from '../components/Foldermodal';
import SharedFolderModal from '../components/Sharedfoldermodal';
import NotificationPanel from '../components/Notificationpanel';
import InviteModal from '../components/Invitemodal';
import TrashView from '../components/Trashview'; 
import ActionModal from '../components/Actionmodal'; 
// 업로드 관련 컴포넌트 추가
import UploadModal from '../components/Uploadmodal'; 
import UploadStatusPanel from '../components/Uploadstatuspanel';
import StorageUsageModal from '../components/StorageUsageModal';
import { Photo } from '../types';
import {
    beginGoogleLogin,
    clearAuthTokens,
    completeGoogleLoginIfNeeded,
    isAuthenticated
} from '../api/auth';
import { createPhoto, getAlbumLatest, movePhotoToTrash } from '../api/photo';
import { commitPhotoUpload, initPhotoUpload, putFileToPresignedUrl } from '../api/upload';
import '../styles/Home.css';

type ViewType = 'home' | 'folder_list' | 'folder_detail' | 'shared_list' | 'shared_detail' | 'trash';

type UploadTaskStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'error';

type UploadTask = {
    id: string;
    file: File;
    filename: string;
    progress: number;
    status: UploadTaskStatus;
    photoId?: number;
    originalKey?: string;
    uploadUrl?: string;
    etag?: string;
    previewUrl?: string;
    errorMessage?: string;
};

export default function Home() {
    const preferPhotoControllerUpload = true;
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(isAuthenticated());
    const [view, setView] = useState<ViewType>('home');
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [folders, setFolders] = useState<string[]>(['폴더 1']);
    const [folderStorageByName, setFolderStorageByName] = useState<Record<string, string>>({
        '폴더 1': '1.2 GB',
    });
    const [sharedFolders, setSharedFolders] = useState<string[]>(['공유 폴더 1']);
    const [sharedFolderStorageByName, setSharedFolderStorageByName] = useState<Record<string, string>>({
        '공유 폴더 1': '11.8 GB',
    });
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isChatOpen, setIsChatOpen] = useState(true);

    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [folderModalMode, setFolderModalMode] = useState<'create' | 'settings'>('create');
    const [selectedFolderForSettings, setSelectedFolderForSettings] = useState('새 폴더');
    const [isSharedModalOpen, setIsSharedModalOpen] = useState(false);
    const [sharedModalMode, setSharedModalMode] = useState<'create' | 'settings'>('settings');
    const [selectedSharedFolderForSettings, setSelectedSharedFolderForSettings] = useState('공유 폴더 1');
    const [isNotiOpen, setIsNotiOpen] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadItems, setUploadItems] = useState<UploadTask[]>([]);

    const [modalConfig, setModalConfig] = useState<{type: 'restore' | 'delete_confirm' | 'alert', message: string} | null>(null);
    const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);

    const [photos, setPhotos] = useState<Photo[]>([]);

    useEffect(() => {
        let mounted = true;

        completeGoogleLoginIfNeeded()
            .then((handled) => {
                if (!mounted) return;
                if (handled) {
                    setIsLoggedIn(true);
                }
            })
            .catch((error: unknown) => {
                if (!mounted) return;
                const message = error instanceof Error ? error.message : '로그인 처리 중 오류가 발생했습니다.';
                window.alert(message);
            });

        return () => {
            mounted = false;
        };
    }, []);

    const handleLogin = async () => {
        try {
            await beginGoogleLogin();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '로그인을 시작할 수 없습니다.';
            window.alert(message);
        }
    };

    const handleLogout = () => {
        clearAuthTokens();
        setIsLoggedIn(false);
        setPhotos([]);
        window.alert('로그아웃되었습니다.');
    };

    const loadAlbum = async () => {
        if (!isAuthenticated()) return;

        try {
            const items = await getAlbumLatest({ size: 60 });
            setPhotos(items.map((item) => ({
                id: String(item.photoId),
                thumbnailUrl: item.thumbnailUrl || item.previewUrl,
                previewUrl: item.previewUrl,
                shotAt: item.shotAt,
                likeCount: 0
            })));
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '앨범을 불러오지 못했습니다.';
            window.alert(message);
        }
    };

    useEffect(() => {
        if (!isLoggedIn) return;
        void loadAlbum();
    }, [isLoggedIn]);

    const updateUploadTask = (id: string, patch: Partial<UploadTask>) => {
        setUploadItems((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)));
    };

    const startUpload = async (files: File[]) => {
        if (files.length === 0) return;

        if (!isAuthenticated()) {
            window.alert('업로드는 로그인 후 사용할 수 있습니다.');
            setIsUploadModalOpen(false);
            return;
        }

        setIsUploadModalOpen(false);

        const initialTasks: UploadTask[] = files.map((file, index) => ({
            id: `${Date.now()}-${index}`,
            file,
            filename: file.name,
            progress: 0,
            status: 'queued'
        }));

        setUploadItems(initialTasks);
        setIsUploading(true);

        const isUnauthorizedError = (error: unknown): boolean => {
            if (!(error instanceof Error)) return false;
            return error.message.includes('401') || error.message.includes('Unauthorized');
        };

        const uploadViaPhotoController = async () => {
            for (const task of initialTasks) {
                try {
                    updateUploadTask(task.id, { status: 'uploading', progress: 35, errorMessage: undefined });
                    await createPhoto(task.file, task.file.lastModified);
                    updateUploadTask(task.id, { status: 'processing', progress: 80 });
                    updateUploadTask(task.id, { status: 'done', progress: 100 });
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : '사진 업로드에 실패했습니다.';
                    updateUploadTask(task.id, { status: 'error', errorMessage: message, progress: 0 });
                }
            }

            await loadAlbum();
        };

        if (preferPhotoControllerUpload) {
            try {
                await uploadViaPhotoController();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : '사진 업로드에 실패했습니다.';
                setUploadItems((prev) => prev.map((task) => ({ ...task, status: 'error', errorMessage: message })));
            } finally {
                window.setTimeout(() => {
                    setIsUploading(false);
                }, 1500);
            }
            return;
        }

        try {
            const initItems = files.map((file) => ({
                originalFilename: file.name,
                contentType: file.type || 'application/octet-stream',
                size: file.size,
                clientLastModifiedMs: file.lastModified
            }));

            let initResults: Awaited<ReturnType<typeof initPhotoUpload>> = [];
            try {
                initResults = await initPhotoUpload(initItems);
            } catch (error: unknown) {
                if (isUnauthorizedError(error)) {
                    await uploadViaPhotoController();
                    return;
                }

                throw error;
            }

            const preparedTasks = initialTasks.map((task, index) => {
                const init = initResults[index];
                if (!init || !Number.isFinite(init.photoId) || init.photoId <= 0 || !init.originalKey || !init.uploadUrl) {
                    return {
                        ...task,
                        status: 'error' as const,
                        errorMessage: '업로드 URL 발급에 실패했습니다.'
                    };
                }

                return {
                    ...task,
                    photoId: init.photoId,
                    originalKey: init.originalKey,
                    uploadUrl: init.uploadUrl
                };
            });

            setUploadItems(preparedTasks);

            const readyTasks = preparedTasks.filter((task) => task.uploadUrl && task.photoId !== undefined && task.originalKey);
            const commitCandidates: { id: string; photoId: number; originalKey: string; etag: string; clientLastModifiedMs: number }[] = [];

            const maxConcurrent = Math.min(3, readyTasks.length);
            let cursor = 0;

            const worker = async () => {
                while (true) {
                    const currentIndex = cursor;
                    cursor += 1;

                    if (currentIndex >= readyTasks.length) return;

                    const task = readyTasks[currentIndex];
                    const uploadUrl = task.uploadUrl as string;

                    try {
                        updateUploadTask(task.id, { status: 'uploading', progress: 0, errorMessage: undefined });

                        const etag = await putFileToPresignedUrl(uploadUrl, task.file, (percent) => {
                            updateUploadTask(task.id, { status: 'uploading', progress: percent });
                        });

                        updateUploadTask(task.id, { status: 'processing', progress: 100, etag });

                        commitCandidates.push({
                            id: task.id,
                            photoId: task.photoId as number,
                            originalKey: task.originalKey as string,
                            etag,
                            clientLastModifiedMs: task.file.lastModified
                        });
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : '파일 업로드에 실패했습니다.';
                        updateUploadTask(task.id, { status: 'error', errorMessage: message });
                    }
                }
            };

            if (maxConcurrent > 0) {
                await Promise.all(Array.from({ length: maxConcurrent }, () => worker()));
            }

            const allPutSucceeded = readyTasks.length > 0 && commitCandidates.length === readyTasks.length;

            if (!allPutSucceeded && commitCandidates.length > 0) {
                setUploadItems((prev) => prev.map((task) => (
                    task.status === 'processing'
                        ? {
                            ...task,
                            status: 'error',
                            errorMessage: '일부 파일 PUT 업로드 실패로 완료 처리를 진행하지 않았습니다.'
                        }
                        : task
                )));
            }

            if (allPutSucceeded) {
                try {
                    const commitResults = await commitPhotoUpload(
                        commitCandidates.map((candidate) => ({
                            photoId: candidate.photoId,
                            originalKey: candidate.originalKey,
                            etag: candidate.etag,
                            clientLastModifiedMs: candidate.clientLastModifiedMs
                        }))
                    );

                    const previewByPhotoId = new Map(
                        commitResults
                            .filter((item) => item.photoId && item.previewUrl)
                            .map((item) => [item.photoId, item.previewUrl])
                    );

                    setUploadItems((prev) => prev.map((task) => {
                        if (task.status !== 'processing') return task;
                        const previewUrl = task.photoId ? previewByPhotoId.get(task.photoId) : undefined;
                        if (!previewUrl) {
                            return {
                                ...task,
                                status: 'error',
                                errorMessage: '서버 후처리에 실패했습니다.'
                            };
                        }

                        return {
                            ...task,
                            status: 'done',
                            previewUrl,
                            progress: 100
                        };
                    }));

                    if (commitResults.length > 0) {
                        await loadAlbum();
                    }
                } catch {
                    setUploadItems((prev) => prev.map((task) => (
                        task.status === 'processing'
                            ? { ...task, status: 'error', errorMessage: '업로드 후처리 요청이 실패했습니다.' }
                            : task
                    )));
                }
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '업로드를 시작할 수 없습니다.';
            setUploadItems((prev) => prev.map((task) => ({ ...task, status: 'error', errorMessage: message })));
        } finally {
            window.setTimeout(() => {
                setIsUploading(false);
            }, 1500);
        }
    };

    const handleNavigate = (type: string, target?: string) => {
        if (type === 'home') {
            setView('home');
            setSelectedFolder(null);
        } else if (type === 'trash') {
            setView('trash');
            setSelectedFolder(null);
        } else if (type === 'folder_parent') {
            setView('folder_list');
            setSelectedFolder(null);
        } else if (type === 'folder_child') {
            setView('folder_detail');
            setSelectedFolder(target || null);
        } else if (type === 'shared_parent') {
            setView('shared_list');
            setSelectedFolder(null);
        } else if (type === 'shared_child') {
            setView('shared_detail');
            setSelectedFolder(target || null);
        }
    };

    const handleSaveFolder = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return false;

        if (folderModalMode === 'create') {
            const normalizedName = trimmed.toLocaleLowerCase();
            const isDuplicate = folders.some(
                (folder) => folder.trim().toLocaleLowerCase() === normalizedName
            );

            if (isDuplicate) {
                setModalConfig({ type: 'alert', message: '이미 존재하는 폴더 이름입니다.' });
                return false;
            }

            setFolders((prev) => [...prev, trimmed]);
            setFolderStorageByName((prev) => ({ ...prev, [trimmed]: '0 MB' }));
            setSelectedFolder(trimmed);
            setView('folder_detail');
        } else {
            setFolders((prev) => prev.map((folder) => folder === selectedFolderForSettings ? trimmed : folder));
            setFolderStorageByName((prev) => {
                const currentStorage = prev[selectedFolderForSettings] ?? '0 MB';
                const next = { ...prev };
                delete next[selectedFolderForSettings];
                next[trimmed] = currentStorage;
                return next;
            });
            if (selectedFolder === selectedFolderForSettings) {
                setSelectedFolder(trimmed);
            }
        }

        return true;
    };

    const handleDeleteFolder = () => {
        const target = selectedFolderForSettings;
        setFolders((prev) => prev.filter((folder) => folder !== target));
        setFolderStorageByName((prev) => {
            const next = { ...prev };
            delete next[target];
            return next;
        });

        if (selectedFolder === target) {
            setSelectedFolder(null);
            setView('folder_list');
        }
    };

    const handleSaveSharedFolder = (nextName: string) => {
        const trimmed = nextName.trim();
        if (!trimmed) return false;

        if (sharedModalMode === 'create') {
            const normalizedName = trimmed.toLocaleLowerCase();
            const isDuplicate = sharedFolders.some(
                (folder) => folder.trim().toLocaleLowerCase() === normalizedName
            );

            if (isDuplicate) {
                setModalConfig({ type: 'alert', message: '이미 존재하는 공유 폴더 이름입니다.' });
                return false;
            }

            setSharedFolders((prev) => [...prev, trimmed]);
            setSharedFolderStorageByName((prev) => ({ ...prev, [trimmed]: '0 MB' }));
            setSelectedFolder(trimmed);
            setView('shared_detail');
            setSelectedSharedFolderForSettings(trimmed);
        } else {
            setSharedFolders((prev) =>
                prev.map((folder) =>
                    folder === selectedSharedFolderForSettings ? trimmed : folder
                )
            );

            setSharedFolderStorageByName((prev) => {
                const currentStorage = prev[selectedSharedFolderForSettings] ?? '0 MB';
                const next = { ...prev };
                delete next[selectedSharedFolderForSettings];
                next[trimmed] = currentStorage;
                return next;
            });

            if (selectedFolder === selectedSharedFolderForSettings) {
                setSelectedFolder(trimmed);
            }

            setSelectedSharedFolderForSettings(trimmed);
        }

        return true;
    };

    const handleLeaveSharedFolder = () => {
        const target = selectedSharedFolderForSettings;

        setSharedFolders((prev) => prev.filter((folder) => folder !== target));
        setSharedFolderStorageByName((prev) => {
            const next = { ...prev };
            delete next[target];
            return next;
        });

        if (selectedFolder === target) {
            setSelectedFolder(null);
            setView('shared_list');
        }
    };

    const activeNavKey =
        view === 'home' ? 'home' :
        view === 'trash' ? 'trash' :
        view === 'folder_list' ? 'folder_parent' :
        view === 'folder_detail' ? `folder_child:${selectedFolder || ''}` :
        view === 'shared_list' ? 'shared_parent' :
        `shared_child:${selectedFolder || ''}`;

    const uploadNotificationItems = uploadItems.filter((item) => item.status !== 'queued');
    const notificationCount = 1 + uploadNotificationItems.length;

    const handleDeleteCurrentPhoto = async () => {
        if (previewIndex === null) return;

        const target = photos[previewIndex];
        if (!target) return;

        const photoId = Number(target.id);
        if (!Number.isFinite(photoId) || photoId <= 0) {
            window.alert('유효하지 않은 사진 ID입니다.');
            return;
        }

        try {
            await movePhotoToTrash(photoId);
            setPhotos((prev) => prev.filter((photo) => photo.id !== target.id));
            setPreviewIndex(null);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '사진 삭제에 실패했습니다.';
            window.alert(message);
        }
    };

    return (
        <div className="home-container">
            <Navbar 
                onNotiClick={() => setIsNotiOpen(!isNotiOpen)} 
                onUploadClick={() => setIsUploadModalOpen(true)} 
                notificationCount={notificationCount}
                isLoggedIn={isLoggedIn}
                onLoginClick={() => void handleLogin()}
                onLogoutClick={handleLogout}
            />

            <div className="main-layout">
                <Sidebar 
                    isOpen={isSidebarOpen}
                    onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
                    activeNav={activeNavKey}
                    folders={folders}
                    sharedFolders={sharedFolders}
                    onNavClick={handleNavigate} 
                    onPlusClick={() => {
                        setFolderModalMode('create');
                        setSelectedFolderForSettings('새 폴더');
                        setIsFolderModalOpen(true);
                    }}
                    onLinkClick={() => {
                        setSharedModalMode('create');
                        setSelectedSharedFolderForSettings(`공유 폴더 ${sharedFolders.length + 1}`);
                        setIsSharedModalOpen(true);
                    }}
                    onStorageClick={() => setIsStorageModalOpen(true)}
                    onFolderSettingsClick={(name) => {
                        setFolderModalMode('settings');
                        setSelectedFolderForSettings(name);
                        setIsFolderModalOpen(true);
                    }}
                    onSharedFolderSettingsClick={(name) => {
                        setSharedModalMode('settings');
                        setSelectedSharedFolderForSettings(name);
                        setIsSharedModalOpen(true);
                    }}
                /> 

                <main className={`photo-area 
                    ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'} 
                    ${isChatOpen ? 'chat-open' : 'chat-closed'}`}
                >
                    {selectedFolder && <h2 className="folder-title">{selectedFolder}</h2>}

                    {view === 'trash' ? (
                        <TrashView isLoggedIn={isLoggedIn} onChanged={() => void loadAlbum()} />
                    ) : (view === 'home' || view === 'folder_detail' || view === 'shared_detail') ? (
                        <div className="photo-grid">
                            {photos.map((photo, index) => (
                                <PhotoCard 
                                    key={photo.id} 
                                    photo={photo} 
                                    onClick={() => setPreviewIndex(index)} 
                                />
                            ))}
                        </div>
                    ) : view === 'folder_list' ? (
                        <FolderView
                            sectionTitle="폴더"
                            folders={folders}
                            onFolderClick={(name) => handleNavigate('folder_child', name)}
                        />
                    ) : (
                        <FolderView
                            sectionTitle="공유 폴더"
                            folders={sharedFolders}
                            onFolderClick={(name) => handleNavigate('shared_child', name)}
                        />
                    )}

                    {isNotiOpen && (
                        <NotificationPanel 
                            onClose={() => setIsNotiOpen(false)} 
                            onItemClick={() => {
                                setIsNotiOpen(false);
                                setShowInviteModal(true);
                            }}
                            uploadItems={uploadNotificationItems.map((item) => ({
                                id: item.id,
                                filename: item.filename,
                                progress: item.progress,
                                status: item.status,
                                errorMessage: item.errorMessage
                            }))}
                        />
                    )}

                    {isUploading && (
                        <UploadStatusPanel
                            items={uploadItems.map((item) => ({
                                id: item.id,
                                filename: item.filename,
                                progress: item.progress,
                                status: item.status,
                                errorMessage: item.errorMessage
                            }))}
                        />
                    )}
                </main>

                <Chatbot 
                    isOpen={isChatOpen} 
                    onClose={() => setIsChatOpen(false)} 
                    onOpen={() => setIsChatOpen(true)} 
                    isLoggedIn={isLoggedIn}
                />
            </div>

            {previewIndex !== null && (
                <PhotoPreview 
                    photo={photos[previewIndex]}
                    onClose={() => setPreviewIndex(null)}
                    onPrev={() => setPreviewIndex((previewIndex - 1 + photos.length) % photos.length)}
                    onNext={() => setPreviewIndex((previewIndex + 1) % photos.length)}
                    onDelete={() => void handleDeleteCurrentPhoto()}
                    onDownload={() => {}}
                />
            )}

            {isFolderModalOpen && (
                <FolderModal
                    mode={folderModalMode}
                    folderName={selectedFolderForSettings}
                    usedStorage={folderStorageByName[selectedFolderForSettings] ?? '0 MB'}
                    onSave={handleSaveFolder}
                    onDelete={handleDeleteFolder}
                    onClose={() => setIsFolderModalOpen(false)}
                />
            )}

            {isSharedModalOpen && (
                <SharedFolderModal
                    mode={sharedModalMode}
                    folderName={selectedSharedFolderForSettings}
                    onSave={handleSaveSharedFolder}
                    onLeave={handleLeaveSharedFolder}
                    onClose={() => setIsSharedModalOpen(false)}
                />
            )}

            {showInviteModal && (
                <InviteModal 
                    albumName="공유 앨범 3" 
                    onClose={() => setShowInviteModal(false)} 
                    onAccept={() => setShowInviteModal(false)}
                    onReject={() => setShowInviteModal(false)}
                />
            )}

            {isUploadModalOpen && (
                <UploadModal 
                    onClose={() => setIsUploadModalOpen(false)} 
                    onStart={startUpload} 
                />
            )}

            {modalConfig && (
                <ActionModal 
                    config={modalConfig} 
                    onClose={() => setModalConfig(null)}
                    onConfirm={() => {
                        if(modalConfig.type === 'delete_confirm') {
                            setModalConfig({type: 'alert', message: '삭제되었습니다.'});
                        } else {
                            setModalConfig(null);
                        }
                    }}
                />
            )}

            {isStorageModalOpen && (
                <StorageUsageModal
                    folderUsages={folders.map((name) => ({
                        name,
                        storage: folderStorageByName[name] ?? '0 MB',
                    }))}
                    sharedFolderUsages={sharedFolders.map((name) => ({
                        name,
                        storage: sharedFolderStorageByName[name] ?? '0 MB',
                    }))}
                    onClose={() => setIsStorageModalOpen(false)}
                />
            )}
        </div>
    );
}