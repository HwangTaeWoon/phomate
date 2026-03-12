import React from 'react';
import { Upload } from 'lucide-react'; 
import '../styles/Navbar.css';

interface NavbarProps {
    onNotiClick?: () => void;   
    onUploadClick?: () => void; 
    onLogoClick?: () => void;
    notificationCount?: number;
    isLoggedIn?: boolean;
    memberNickname?: string;
    memberProfileImageUrl?: string;
    onLoginClick?: () => void;
    onLogoutClick?: () => void;
}

export default function Navbar({
    onNotiClick,
    onUploadClick,
    onLogoClick,
    notificationCount = 0,
    isLoggedIn = false,
    memberNickname,
    memberProfileImageUrl,
    onLoginClick,
    onLogoutClick
}: NavbarProps) {

    return (
        <nav className="navbar">
            <div className="nav-left">
                <div className="auth-links">
                    {isLoggedIn ? (
                        <span className="clickable" onClick={onLogoutClick}>로그아웃</span>
                    ) : (
                        <span className="clickable" onClick={onLoginClick}>로그인</span>
                    )}
                </div>
            </div>
            
            <div className="nav-center">
                <h1 className="logo-text" onClick={onLogoClick}>
                    PHOMATE
                </h1>
            </div>

            <div className="nav-right">
                <div className="notification-wrapper" onClick={onNotiClick}>
                    <div className="bell-container">
                        <svg className="bell-svg" viewBox="0 0 24 24" fill="none" stroke="#003366" strokeWidth="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        {notificationCount > 0 && (
                            <div className="noti-badge">{notificationCount}</div>
                        )}
                    </div>
                </div>
                
                <div className="upload-btn clickable" onClick={onUploadClick}>
                    <Upload size={18} className="upload-icon" />
                    <span>업로드</span>
                </div>

                {isLoggedIn && (
                    <div className="user-info">
                        {memberProfileImageUrl ? (
                            <img
                                className="user-avatar"
                                src={memberProfileImageUrl}
                                alt="프로필"
                            />
                        ) : (
                            <div className="user-avatar user-avatar-fallback">
                                {(memberNickname?.trim().charAt(0) || 'U').toUpperCase()}
                            </div>
                        )}
                        <span className="user-name">{memberNickname || '사용자'}</span>
                    </div>
                )}
            </div>
        </nav>
    );
}