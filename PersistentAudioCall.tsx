// src/components/PersistentAudioCall.tsx
'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/useUser';
import { useAudioCall } from '@/context/AudioCallContext';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
    FiMic, FiMicOff, FiPhoneOff, FiHeadphones,
    FiVolume2, FiVolumeX, FiUser, FiX, FiMinimize2,
    FiMaximize2, FiMonitor, FiSquare, FiRefreshCw,
    FiVideo, FiVideoOff
} from 'react-icons/fi';

interface AudioParticipant {
    userId: string;
    name: string;
    avatarUrl: string | null;
    isMuted: boolean;
    isSpeaking: boolean;
    isSharingScreen: boolean;
    hasVideo: boolean;
    joinTime: string;
    remoteVideoStream: MediaStream | null;
    remoteScreenStream: MediaStream | null;
}

interface PersistentAudioCallProps {
    isVisible?: boolean;
    onMinimize?: () => void;
    onClose?: () => void;
}

interface ScreenShareParticipant {
    userId: string;
    name: string;
    stream: MediaStream | null;
    isFullscreen: boolean;
    isMinimized: boolean;
}

interface ExtendedMediaStreamTrack extends MediaStreamTrack {
    _customLabel?: string;
}

// Стили (оставить без изменений, они уже хорошо написаны)
const CallContainer = styled(motion.div) <{ $isMinimized: boolean }>`
  position: fixed;
  top: ${props => props.$isMinimized ? 'auto' : 'env(safe-area-inset-top, 70px)'};
  bottom: ${props => props.$isMinimized ? 'max(20px, env(safe-area-inset-bottom))' : 'auto'};
  right: max(10px, env(safe-area-inset-right));
  left: ${props => props.$isMinimized ? 'auto' : 'max(10px, env(safe-area-inset-left))'};
  z-index: 1000;
  background: rgba(15, 23, 42, 0.98);
  border-radius: ${props => props.$isMinimized ? '50%' : '16px'};
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  min-width: ${props => props.$isMinimized ? '60px' : 'min(350px, 90vw)'};
  max-width: ${props => props.$isMinimized ? '60px' : 'min(500px, 95vw)'};
  height: ${props => props.$isMinimized ? '60px' : 'auto'};
  max-height: ${props => props.$isMinimized ? '60px' : '80vh'};
  cursor: ${props => props.$isMinimized ? 'pointer' : 'default'};
  
  @media (max-width: 480px) {
    border-radius: ${props => props.$isMinimized ? '50%' : '12px'};
    min-width: ${props => props.$isMinimized ? '50px' : '85vw'};
    max-width: ${props => props.$isMinimized ? '50px' : '90vw'};
    height: ${props => props.$isMinimized ? '50px' : 'auto'};
  }
`;

const CallHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(139, 92, 246, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  cursor: move;
  min-height: 48px;
  
  @media (max-width: 480px) {
    padding: 10px 12px;
    min-height: 44px;
  }
`;

const CallTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  
  @media (max-width: 480px) {
    font-size: 13px;
    gap: 6px;
  }
`;

const HeaderControls = styled.div`
  display: flex;
  gap: 6px;
  
  @media (max-width: 480px) {
    gap: 4px;
  }
`;

const ControlButton = styled.button`
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s ease;
  min-width: 32px;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }
  
  @media (max-width: 480px) {
    padding: 5px;
    min-width: 28px;
    min-height: 28px;
  }
`;

const CallContent = styled.div<{ $isMinimized: boolean }>`
  padding: ${props => props.$isMinimized ? '0' : '16px'};
  display: ${props => props.$isMinimized ? 'none' : 'block'};
  
  @media (max-width: 480px) {
    padding: ${props => props.$isMinimized ? '0' : '12px'};
  }
`;

const ParticipantsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
  max-height: 150px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  
  @media (max-width: 480px) {
    grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
    gap: 8px;
    max-height: 120px;
  }
`;

const ParticipantCard = styled.div<{ $speaking?: boolean; $sharingScreen?: boolean }>`
  padding: 10px;
  border-radius: 8px;
  background: ${props => {
        if (props.$sharingScreen) return 'rgba(245, 158, 11, 0.1)';
        return props.$speaking ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.5)';
    }};
  border: 1px solid ${props => {
        if (props.$sharingScreen) return 'rgba(245, 158, 11, 0.3)';
        return props.$speaking ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)';
    }};
  text-align: center;
  position: relative;
  
  @media (max-width: 480px) {
    padding: 8px;
    border-radius: 6px;
  }
`;

const ParticipantAvatar = styled.div<{ $src?: string }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  margin: 0 auto 6px;
  background: ${props => props.$src ? `url(${props.$src}) center/cover` : 'rgba(139, 92, 246, 0.1)'};
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8b5cf6;
  border: 1px solid rgba(255, 255, 255, 0.1);
  
  @media (max-width: 480px) {
    width: 32px;
    height: 32px;
    margin-bottom: 4px;
  }
`;

const ParticipantName = styled.div`
  font-size: 11px;
  font-weight: 500;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  
  @media (max-width: 480px) {
    font-size: 10px;
  }
`;

const ParticipantStatus = styled.div<{ $muted?: boolean; $sharingScreen?: boolean }>`
  font-size: 9px;
  color: ${props => {
        if (props.$sharingScreen) return '#f59e0b';
        return props.$muted ? '#ef4444' : '#10b981';
    }};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  margin-top: 3px;
  
  @media (max-width: 480px) {
    font-size: 8px;
    gap: 2px;
  }
`;

const ControlsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 20px;
  padding: 8px 0;
  
  @media (max-width: 480px) {
    display: flex;
    overflow-x: auto;
    gap: 8px;
    padding: 12px 0;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
    
    &::-webkit-scrollbar {
      display: none;
    }
    
    & > * {
      flex: 0 0 auto;
      min-width: 50px;
    }
  }
`;

const MinimizedView = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #fff;
  font-size: 20px;
  
  @media (max-width: 480px) {
    font-size: 18px;
  }
`;

const ScreenShareIndicator = styled.div`
  position: absolute;
  top: 3px;
  right: 3px;
  background: rgba(245, 158, 11, 0.9);
  border-radius: 50%;
  width: 10px;
  height: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  
  @media (max-width: 480px) {
    width: 8px;
    height: 8px;
    top: 2px;
    right: 2px;
  }
`;

const ControlIcon = styled.button<{
    $active?: boolean;
    $end?: boolean;
    $warning?: boolean;
    disabled?: boolean;
}>`
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => {
        if (props.$end) return 'rgba(239, 68, 68, 0.2)';
        if (props.$warning || props.disabled) return 'rgba(245, 158, 11, 0.2)';
        return props.$active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)';
    }};
  border: 1px solid ${props => {
        if (props.$end) return 'rgba(239, 68, 68, 0.3)';
        if (props.$warning || props.disabled) return 'rgba(245, 158, 11, 0.3)';
        return props.$active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(139, 92, 246, 0.3)';
    }};
  color: ${props => {
        if (props.$end) return '#ef4444';
        if (props.$warning || props.disabled) return '#f59e0b';
        return props.$active ? '#10b981' : '#8b5cf6';
    }};
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease;
  touch-action: manipulation;
  
  &:hover {
    transform: ${props => props.disabled ? 'scale(1)' : 'scale(1.05)'};
  }
  
  &:active {
    transform: ${props => props.disabled ? 'scale(1)' : 'scale(0.95)'};
  }
  
  @media (max-width: 480px) {
    width: 40px;
    height: 40px;
    border-radius: 8px;
  }
`;

const ScreenShareView = styled(motion.div) <{
    $isFullscreen: boolean;
    $isMinimized: boolean;
    $isLocal: boolean;
}>`
  position: ${props => props.$isFullscreen ? 'fixed' : 'absolute'};
  top: ${props => props.$isFullscreen ? '0' : props.$isMinimized ? 'auto' : '0'};
  left: ${props => props.$isFullscreen ? '0' : props.$isMinimized ? 'auto' : '0'};
  right: ${props => props.$isMinimized ? '0' : 'auto'};
  bottom: ${props => props.$isMinimized ? '0' : 'auto'};
  width: ${props => props.$isFullscreen ? '100vw' : props.$isMinimized ? '200px' : '100%'};
  height: ${props => props.$isFullscreen ? '100vh' : props.$isMinimized ? '120px' : '200px'};
  background: #000;
  border-radius: ${props => props.$isFullscreen ? '0' : '8px'};
  overflow: hidden;
  z-index: ${props => props.$isFullscreen ? 2000 : 1001};
  border: ${props => props.$isLocal ? '2px solid #f59e0b' : '2px solid #10b981'};
  
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }
`;

const ScreenControls = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 8px;
  background: rgba(0, 0, 0, 0.7);
  padding: 8px;
  border-radius: 6px;
  z-index: 1002;
`;

const ScreenControlButton = styled.button`
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const VideoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin: 16px 0;
  max-height: 300px;
  overflow-y: auto;
  
  @media (max-width: 768px) {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    max-height: 250px;
  }
  
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    max-height: 200px;
  }
`;

const VideoContainer = styled.div<{ $speaking?: boolean }>`
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
  border: 3px solid ${props => props.$speaking ? 'rgba(16, 185, 129, 0.8)' : 'rgba(255, 255, 255, 0.2)'};
  aspect-ratio: 16/9;
  transition: border-color 0.3s ease;
  
  &:hover {
    border-color: rgba(139, 92, 246, 0.8);
  }
  
  &:hover .video-controls {
    opacity: 1;
  }
`;

const VideoElement = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: #000;
`;

const VideoInfo = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const VideoName = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70%;
`;

const VideoStatus = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  color: white;
  font-size: 11px;
`;

const VideoControls = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.3s;
  
  &.visible {
    opacity: 1;
  }
`;

const VideoControlButton = styled.button`
  background: rgba(0, 0, 0, 0.7);
  border: none;
  color: white;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  
  &:hover {
    background: rgba(0, 0, 0, 0.9);
  }
`;

const ScreenShareGrid = styled.div`
  margin-top: 16px;
  
  h4 {
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
`;

// Основной компонент
export default function PersistentAudioCall({
    isVisible = true,
    onMinimize,
    onClose
}: PersistentAudioCallProps) {
    const { user } = useUser();
    const audioCall = useAudioCall();

    const [audioParticipants, setAudioParticipants] = useState<AudioParticipant[]>([]);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 20, y: 70 });
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isInitializing, setIsInitializing] = useState(false);
    const [isLocalStreamReady, setIsLocalStreamReady] = useState(false);
    const [hasActiveConnections, setHasActiveConnections] = useState(false);

    const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
    const senderTrackLabels = useRef<Record<string, Map<string, RTCRtpSender>>>({});
    const pendingOffers = useRef<Array<{ senderId: string, offer: RTCSessionDescriptionInit, sessionId: string }>>([]);
    const isFirstRefresh = useRef(true);
    const audioContexts = useRef<Record<string, AudioContext>>({});
    const analysers = useRef<Record<string, AnalyserNode>>({});
    const animationFrameIds = useRef<Record<string, number>>({});
    const audioChannels = useRef<{
        participants?: any;
        signaling?: any;
        screenSignaling?: any;
        session?: any;
    }>({});
    const hasInitializedRef = useRef(false);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const localScreenVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRefs = useRef<Record<string, HTMLVideoElement>>({});
    const remoteAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
    const remoteScreenRefs = useRef<Record<string, HTMLVideoElement>>({});

    const [screenShareParticipants, setScreenShareParticipants] = useState<ScreenShareParticipant[]>([]);
    const [localScreenShare, setLocalScreenShare] = useState<{
        stream: MediaStream | null;
        isFullscreen: boolean;
        isMinimized: boolean;
    }>({
        stream: null,
        isFullscreen: false,
        isMinimized: false
    });
    const prevStreamsRef = useRef({
      prevAudio: null as MediaStream | null,
  localStream: null as MediaStream | null,
  localVideoStream: null as MediaStream | null,
  screenStream: null as MediaStream | null
});
    const containerRef = useRef<HTMLDivElement>(null);

    const iceServers = useRef([
        { urls: "stun:turn.naukaprosto.su:3478" },
        {
            urls: "turn:turn.naukaprosto.su:3478",
            username: "username",
            credential: "password"
        },
        {
            urls: "turn:turn.naukaprosto.su:3478?transport=tcp",
            username: "username",
            credential: "password"
        },
        {
            urls: "turns:turn.naukaprosto.su:5349",
            username: "username",
            credential: "password"
        }
    ]);

    // Улучшенная функция получения медиа потока
    const getUserMediaStream = async (withVideo = false): Promise<MediaStream> => {
        try {
            const constraints: MediaStreamConstraints = withVideo
                ? {
                    video: {
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 },
                        facingMode: 'user'
                    },
                    audio: {
                        noiseSuppression: true,
                        echoCancellation: true,
                        autoGainControl: true
                    }
                }
                : {
                    audio: {
                        noiseSuppression: true,
                        echoCancellation: true,
                        autoGainControl: true,
                        channelCount: 1,
                        sampleRate: 48000,
                        sampleSize: 16
                    },
                    video: false
                };

            console.log('Запрашиваем медиа поток с настройками:', constraints);
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            if (withVideo) {
                stream.getVideoTracks().forEach(track => {
                    console.log('Видео трек получен:', {
                        label: track.label,
                        enabled: track.enabled,
                        readyState: track.readyState
                    });
                    const extendedTrack = track as ExtendedMediaStreamTrack;
                    extendedTrack._customLabel = 'camera';
                });
            }

            stream.getAudioTracks().forEach(track => {
                track.enabled = true;
                console.log('Аудио трек получен:', {
                    label: track.label,
                    enabled: track.enabled
                });
            });

            return stream;
        } catch (error) {
            console.error('Ошибка при получении медиапотока:', error);
            toast.error('Не удалось получить доступ к камере/микрофону');
            throw error;
        }
    };

    // Получение участников сессии
    const getSessionParticipants = async (sessionId: string) => {
        try {
            const { data: participants, error } = await supabase
                .from('audio_participants')
                .select(`user_id, is_muted, is_speaking, stream, has_video, join_time, users:user_id (id, name, avatar_url)`)
                .eq('session_id', sessionId)
                .is('leave_time', null);

            if (error) throw error;

            return participants?.map(p => ({
                userId: p.user_id,
                name: p.users.name,
                avatarUrl: p.users.avatar_url,
                isMuted: p.is_muted,
                isSpeaking: p.is_speaking,
                isSharingScreen: p.stream,
                hasVideo: p.has_video ?? false,
                joinTime: p.join_time,
                remoteVideoStream: null,
                remoteScreenStream: null
            })) || [];
        } catch (error) {
            console.error('Ошибка при получении участников сессии:', error);
            return [];
        }
    };

    // Обновление статуса видео участника
    const updateParticipantVideoStatus = async (sessionId: string, hasVideo: boolean) => {
        if (!user) return false;
        try {
            const { error } = await supabase
                .from('audio_participants')
                .update({
                    has_video: hasVideo,
                    updated_at: new Date().toISOString()
                })
                .eq('session_id', sessionId)
                .eq('user_id', user.id)
                .is('leave_time', null);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Ошибка при обновлении статуса видео:', error);
            return false;
        }
    };

    // Обновление статуса микрофона
    const updateParticipantMuteStatus = async (sessionId: string, isMuted: boolean) => {
        if (!user) return false;
        try {
            const { error } = await supabase
                .from('audio_participants')
                .update({
                    is_muted: isMuted,
                    updated_at: new Date().toISOString()
                })
                .eq('session_id', sessionId)
                .eq('user_id', user.id)
                .is('leave_time', null);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Ошибка при обновлении статуса микрофона:', error);
            return false;
        }
    };

    // Добавление участника в сессию
    const addParticipantToSession = async (sessionId: string) => {
        if (!user) return false;
        try {
            const now = new Date().toISOString();

            const { data: existingParticipant, error: checkError } = await supabase
                .from('audio_participants')
                .select('*')
                .eq('session_id', sessionId)
                .eq('user_id', user.id)
                .maybeSingle();

            if (checkError) throw checkError;

            if (existingParticipant) {
                if (existingParticipant.leave_time) {
                    const { error: updateError } = await supabase
                        .from('audio_participants')
                        .update({
                            join_time: now,
                            leave_time: null,
                            is_muted: true,
                            is_speaking: false,
                            has_video: false,
                            stream: false,
                            updated_at: now
                        })
                        .eq('session_id', sessionId)
                        .eq('user_id', user.id);

                    if (updateError) throw updateError;
                    return true;
                }
                return true;
            }

            const { error } = await supabase
                .from('audio_participants')
                .insert({
                    session_id: sessionId,
                    user_id: user.id,
                    join_time: now,
                    leave_time: null,
                    is_muted: true,
                    is_speaking: false,
                    has_video: false,
                    stream: false,
                    updated_at: now
                });

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Ошибка при добавлении участника в сессию:', error);
            return false;
        }
    };

    // Удаление участника из сессии
    const removeParticipantFromSession = async (sessionId: string) => {
        if (!user) return false;
        try {
            const now = new Date().toISOString();
            const { error } = await supabase
                .from('audio_participants')
                .update({
                    leave_time: now,
                    is_muted: true,
                    is_speaking: false,
                    has_video: false,
                    stream: false,
                    updated_at: now
                })
                .eq('session_id', sessionId)
                .eq('user_id', user.id)
                .is('leave_time', null);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Ошибка при удалении участника из сессии:', error);
            return false;
        }
    };

    // Очистка сигналов сессии
    const cleanupSessionSignals = async (sessionId: string) => {
        try {
            const { error } = await supabase
                .from('audio_signaling')
                .delete()
                .eq('session_id', sessionId);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Ошибка при очистке сигналов сессии:', error);
            return false;
        }
    };

    // Проверка активных соединений
    const checkActiveConnections = useCallback(() => {
        const active = Object.values(peerConnections.current).some(pc =>
            pc.iceConnectionState === 'connected' ||
            pc.iceConnectionState === 'completed'
        );

        const previousState = hasActiveConnections;
        setHasActiveConnections(active);

        if (active && !previousState && !audioCall.isMuted) {
            if (localStream) {
                localStream.getAudioTracks().forEach(track => track.enabled = false);
            }
            audioCall.setMuteState(true);

            if (audioCall.currentSessionId && user) {
                supabase
                    .from('audio_participants')
                    .update({
                        is_muted: true,
                        updated_at: new Date().toISOString()
                    })
                    .eq('session_id', audioCall.currentSessionId)
                    .eq('user_id', user.id)
                    .is('leave_time', null)
                    .then(({ error }) => {
                        if (error) console.error('Ошибка при обновлении статуса микрофона:', error);
                    });
            }

            toast.info('Соединение восстановлено. Микрофон выключен для безопасности');
        }

        if (!active && audioCall.currentSessionId && user) {
            supabase
                .from('audio_participants')
                .update({
                    is_muted: true,
                    updated_at: new Date().toISOString()
                })
                .eq('session_id', audioCall.currentSessionId)
                .eq('user_id', user.id)
                .is('leave_time', null)
                .then(({ error }) => {
                    if (error) console.error('Ошибка при обновлении статуса микрофона:', error);
                });
        }

        return active;
    }, [audioCall.currentSessionId, user, audioCall.isMuted, localStream, hasActiveConnections]);

    // Обработчики перетаскивания
    const handleMouseDown = (e: React.MouseEvent) => {
        if (isMinimized) {
            setIsMinimized(false);
            return;
        }
        if (e.target instanceof HTMLElement && e.target.closest('button')) {
            return;
        }

        setIsDragging(true);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            });
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        setPosition({
            x: Math.max(0, Math.min(window.innerWidth - 300, newX)),
            y: Math.max(0, Math.min(window.innerHeight - 200, newY))
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, dragOffset]);

    // Обработка отложенных предложений
    const processPendingOffers = async () => {
        if (!isLocalStreamReady || !localStream || pendingOffers.current.length === 0) {
            return;
        }

        const offersToProcess = [...pendingOffers.current];
        pendingOffers.current = [];

        for (const pendingOffer of offersToProcess) {
            try {
                await handleIncomingOffer(pendingOffer.senderId, pendingOffer.offer, pendingOffer.sessionId);
            } catch (error) {
                console.error(`Ошибка обработки ожидающего offer:`, error);
            }
        }
    };

    // Инициализация звонка
// Инициализация звонка - УЛУЧШЕННАЯ ВЕРСИЯ
const initializeCall = async (sessionId: string, initialMuteState?: boolean) => {
  if (!user || isInitializing) return;
  
  try {
    setIsInitializing(true);
    
    // 1. Очищаем все предыдущие подписки и соединения
    cleanupAllSubscriptions();
    await cleanupCall(true);
    
    // 2. Получаем локальный медиа-поток (только аудио)
    const stream = await getUserMediaStream(false);
    setLocalStream(stream);
    
    // 3. Устанавливаем начальное состояние микрофона
    const targetMuteState = initialMuteState !== undefined ? initialMuteState : audioCall.isMuted;
    stream.getAudioTracks().forEach(track => track.enabled = !targetMuteState);
    
    // 4. Добавляем участника в сессию
    const added = await addParticipantToSession(sessionId);
    if (!added) throw new Error('Не удалось добавить участника в сессию');
    
    // 5. Получаем начальное состояние всех участников из БД
    const initialParticipants = await getSessionParticipants(sessionId);
    setAudioParticipants(initialParticipants);
    
    // 6. Устанавливаем локальное состояние участника
    const localParticipant = initialParticipants.find(p => p.userId === user.id);
    if (!localParticipant) {
      setAudioParticipants(prev => [
        ...prev,
        {
          userId: user.id,
          name: user.name || "Вы",
          avatarUrl: user.avatar_url,
          isMuted: targetMuteState,
          isSpeaking: false,
          isSharingScreen: false,
          hasVideo: false,
          joinTime: new Date().toISOString(),
          remoteVideoStream: null,
          remoteScreenStream: null
        }
      ]);
    }
    
    audioCall.setMuteState(targetMuteState);
    
    // 7. ПОДПИСКИ создаются ДО установки соединений
    // Это критически важно для корректного определения типа видео-треков
    
    // Подписка на изменения участников (для получения статуса экрана/видео)
    if (!audioChannels.current.participants) {
      subscribeToParticipantsChanges(sessionId);
    }
    
    // Подписка на сигнализацию (ICE, offers, answers)
    if (!audioChannels.current.signaling) {
      subscribeToSignaling(sessionId);
    }
    
    // Подписка на сигнализацию экрана
    if (!audioChannels.current.screenSignaling) {
      subscribeToScreenSignaling(sessionId);
    }
    
    // Подписка на изменения сессии
    if (!audioChannels.current.session && audioCall.currentLobbyId) {
      subscribeToSessionChanges(audioCall.currentLobbyId);
    }
    
    // 8. Ждем немного, чтобы подписки успели инициализироваться
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 9. Получаем список других участников для установки соединений
    const { data: otherParticipants, error: participantsError } = await supabase
      .from('audio_participants')
      .select('user_id')
      .eq('session_id', sessionId)
      .is('leave_time', null)
      .neq('user_id', user.id);
    
    if (participantsError) {
      console.error('Ошибка получения списка участников:', participantsError);
    }
    
    // 10. Устанавливаем соединения с каждым участником
    if (otherParticipants && otherParticipants.length > 0) {
      console.log(`Устанавливаем соединения с ${otherParticipants.length} участниками`);
      
      // Устанавливаем соединения параллельно, но с небольшой задержкой
      for (const participant of otherParticipants) {
        await setupPeerConnection(participant.user_id, sessionId);
        // Небольшая задержка между соединениями для избежания перегрузки
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // 11. Обрабатываем отложенные предложения
    await processPendingOffers();
    
    // 12. Помечаем локальный поток как готовый
    setIsLocalStreamReady(true);
    
    toast.success('Подключение к звонку установлено');
    
  } catch (error) {
    console.error('Ошибка инициализации звонка:', error);
    toast.error('Не удалось подключиться к звонку');
    
    // В случае ошибки очищаем подписки
    cleanupAllSubscriptions();
    setIsLocalStreamReady(false);
    
    // Повторная попытка через 3 секунды
    setTimeout(() => {
      if (audioCall.isCallActive && audioCall.currentSessionId) {
        console.log('Повторная попытка инициализации...');
        initializeCall(audioCall.currentSessionId, initialMuteState).catch(console.error);
      }
    }, 3000);
    
  } finally {
    setIsInitializing(false);
  }
};

    // Улучшенная функция обновления всех peer-соединений
const updateAllPeerConnections = useCallback(() => {
  Object.entries(peerConnections.current).forEach(([userId, pc]) => {
    if (pc.signalingState === 'closed' || pc.iceConnectionState === 'closed') {
      delete senderTrackLabels.current[userId];
      return;
    }
    
    if (!senderTrackLabels.current[userId]) {
      senderTrackLabels.current[userId] = new Map();
    }
    
    const labelMap = senderTrackLabels.current[userId];
    const senders = pc.getSenders();
    
    // 1. Обновляем аудио
    const audioTrack = localStream?.getAudioTracks()[0];
    const audioSender = senders.find(s => s.track?.kind === 'audio');
    
    if (audioTrack) {
      if (audioSender) {
        audioSender.replaceTrack(audioTrack).catch(error => {
          console.warn(`Ошибка замены аудио трека для ${userId}:`, error);
        });
      } else {
        try {
          pc.addTrack(audioTrack, localStream!);
          console.log(`✅ Добавлен аудио трек для ${userId}`);
        } catch (addTrackError) {
          console.warn(`Ошибка добавления аудио трека для ${userId}:`, addTrackError);
        }
      }
    } else if (audioSender) {
      pc.removeTrack(audioSender);
    }
    
    // 2. Обновляем видео с камеры
    const videoTrack = localVideoStream?.getVideoTracks()[0];
    const cameraSender = senders.find(s =>
      (s.track as ExtendedMediaStreamTrack)?._customLabel === 'camera'
    );
    
    if (videoTrack) {
      const extendedTrack = videoTrack as ExtendedMediaStreamTrack;
      if (!extendedTrack._customLabel) {
        extendedTrack._customLabel = 'camera';
      }
      
      if (cameraSender) {
        cameraSender.replaceTrack(extendedTrack).catch(error => {
          console.warn(`Ошибка замены видео трека камеры для ${userId}:`, error);
        });
      } else {
        try {
          const newSender = pc.addTrack(extendedTrack, localVideoStream!);
          labelMap.set('camera', newSender);
          console.log(`✅ Добавлен видео трек камеры для ${userId}`);
          
          // Инициируем переговоры для отправки нового трека
          if (pc.signalingState === 'stable') {
            pc.createOffer()
              .then(offer => pc.setLocalDescription(offer))
              .then(() => {
                if (audioCall.currentSessionId) {
                  supabase
                    .from('audio_signaling')
                    .insert({
                      sender_id: user?.id,
                      receiver_id: userId,
                      session_id: audioCall.currentSessionId,
                      offer: JSON.stringify(pc.localDescription)
                    })
                    .then(({ error }) => {
                      if (error) console.error('Ошибка отправки renegotiation offer:', error);
                    });
                }
              })
              .catch(error => console.error('Ошибка renegotiation:', error));
          }
        } catch (addTrackError) {
          console.warn(`Ошибка добавления видео трека камеры для ${userId}:`, addTrackError);
        }
      }
    } else if (cameraSender) {
      pc.removeTrack(cameraSender);
      labelMap.delete('camera');
      console.log(`❌ Удалён видео трек камеры для ${userId}`);
    }
    
    // 3. Обновляем демонстрацию экрана
    const screenTrack = screenStream?.getVideoTracks()[0];
    const screenSender = senders.find(s =>
      (s.track as ExtendedMediaStreamTrack)?._customLabel === 'screen'
    );
    
    if (screenTrack) {
      const extendedTrack = screenTrack as ExtendedMediaStreamTrack;
      if (!extendedTrack._customLabel) {
        extendedTrack._customLabel = 'screen';
      }
      
      if (screenSender) {
        screenSender.replaceTrack(extendedTrack).catch(error => {
          console.warn(`Ошибка замены видео трека экрана для ${userId}:`, error);
        });
      } else {
        try {
          const newSender = pc.addTrack(extendedTrack, screenStream!);
          labelMap.set('screen', newSender);
          console.log(`✅ Добавлен видео трек экрана для ${userId}`);
          
          // Инициируем переговоры для отправки нового трека
          if (pc.signalingState === 'stable') {
            pc.createOffer()
              .then(offer => pc.setLocalDescription(offer))
              .then(() => {
                if (audioCall.currentSessionId) {
                  supabase
                    .from('audio_signaling')
                    .insert({
                      sender_id: user?.id,
                      receiver_id: userId,
                      session_id: audioCall.currentSessionId,
                      offer: JSON.stringify(pc.localDescription)
                    })
                    .then(({ error }) => {
                      if (error) console.error('Ошибка отправки renegotiation offer:', error);
                    });
                }
              })
              .catch(error => console.error('Ошибка renegotiation:', error));
          }
        } catch (addTrackError) {
          console.warn(`Ошибка добавления видео трека экрана для ${userId}:`, addTrackError);
        }
      }
    } else if (screenSender) {
      pc.removeTrack(screenSender);
      labelMap.delete('screen');
      console.log(`❌ Удалён видео трек экрана для ${userId}`);
    }
  });
}, [localStream, localVideoStream, screenStream, audioCall.currentSessionId, user]);

    // Настройка peer-соединения
    const setupPeerConnection = async (userId: string, sessionId: string) => {
        if (!audioCall.isCallActive || !user || !localStream || isInitializing) {
  console.warn('Пропуск setupPeerConnection: звонок не активен, нет пользователя, потока или идёт инициализация');
  return;
}

        try {
            // Закрываем старое соединение если есть
            if (peerConnections.current[userId]) {
                peerConnections.current[userId].close();
                delete peerConnections.current[userId];
                delete senderTrackLabels.current[userId];
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const peerConnection = new RTCPeerConnection({
                iceServers: iceServers.current,
                iceTransportPolicy: "all",
                bundlePolicy: "max-bundle",
                rtcpMuxPolicy: "require",
            });

            senderTrackLabels.current[userId] = new Map();
            peerConnections.current[userId] = peerConnection;

            // Обработчики событий
            peerConnection.oniceconnectionstatechange = () => {
                const state = peerConnection.iceConnectionState;
                console.log(`ICE состояние для ${userId}:`, state);

                if (state === 'disconnected' || state === 'failed') {
                    console.log(`Переподключение для ${userId} через 2 секунды...`);
                    setTimeout(() => {
                        if (audioCall.isCallActive && !peerConnections.current[userId]) {
                            setupPeerConnection(userId, sessionId);
                        }
                    }, 2000);
                } else if (state === 'connected' || state === 'completed') {
                    console.log(`Соединение установлено с ${userId}`);
                    setTimeout(() => updateAllPeerConnections(), 500);
                }

                checkActiveConnections();
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    supabase
                        .from('audio_signaling')
                        .insert({
                            sender_id: user.id,
                            receiver_id: userId,
                            session_id: sessionId,
                            ice_candidate: JSON.stringify(event.candidate.toJSON())
                        })
                        .then(({ error }) => {
                            if (error) console.error('Ошибка отправки ICE:', error);
                        });
                }
            };

            peerConnection.ontrack = (event) => {
  console.log(`[%cONTRACK] Получен трек от ${userId}`, 'color: cyan; font-weight: bold;', {
    kind: event.track.kind,
    streamId: event.streams[0]?.id,
    trackId: event.track.id,
    label: event.track.label,
    readyState: event.track.readyState,
    enabled: event.track.enabled,
    timestamp: new Date().toISOString()
  });
  
  if (event.track.kind === 'video') {
    const videoStream = new MediaStream([event.track]);
    console.log(`[%cONTRACK] Создан видео-поток:`, 'color: cyan;', {
      streamId: videoStream.id,
      tracks: videoStream.getTracks().length
    });
    handleRemoteStream(userId, videoStream, event.track);
  } else {
    handleRemoteStream(userId, event.streams[0], event.track);
  }
};

            peerConnection.onnegotiationneeded = async () => {
                console.log(`Требуется переговоры для ${userId}`);
                try {
                    const offer = await peerConnection.createOffer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: true
                    });

                    await peerConnection.setLocalDescription(offer);

                    const { error } = await supabase
                        .from('audio_signaling')
                        .insert({
                            sender_id: user.id,
                            receiver_id: userId,
                            session_id: sessionId,
                            offer: JSON.stringify(offer)
                        });

                    if (error) throw error;
                    console.log(`Отправлен offer для ${userId}`);
                } catch (error) {
                    console.error(`Ошибка при переговорах с ${userId}:`, error);
                }
            };

            // Добавляем все треки
            // 1. Аудио трек
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                try {
                    console.log(`Добавляем аудио трек для ${userId}`);
                    peerConnection.addTrack(audioTrack, localStream);
                } catch (error) {
                    console.error(`Ошибка добавления аудио трека для ${userId}:`, error);
                }
            }

            // 2. Видео трек камеры (если есть)
            if (localVideoStream && localVideoStream.getVideoTracks().length > 0) {
                const videoTrack = localVideoStream.getVideoTracks()[0];
                if (videoTrack) {
                    try {
                        console.log(`Добавляем видео трек камеры для ${userId}`);
                        const extendedTrack = videoTrack as ExtendedMediaStreamTrack;
                        extendedTrack._customLabel = 'camera';
                        const sender = peerConnection.addTrack(extendedTrack, localVideoStream);
                        senderTrackLabels.current[userId].set('camera', sender);
                    } catch (error) {
                        console.error(`Ошибка добавления видео трека камеры для ${userId}:`, error);
                    }
                }
            }

            // 3. Видео трек экрана (если есть)
            if (screenStream && screenStream.getVideoTracks().length > 0) {
                const screenTrack = screenStream.getVideoTracks()[0];
                if (screenTrack) {
                    try {
                        console.log(`Добавляем видео трек экрана для ${userId}`);
                        const extendedTrack = screenTrack as ExtendedMediaStreamTrack;
                        extendedTrack._customLabel = 'screen';
                        const sender = peerConnection.addTrack(extendedTrack, screenStream);
                        senderTrackLabels.current[userId].set('screen', sender);
                    } catch (error) {
                        console.error(`Ошибка добавления видео трека экрана для ${userId}:`, error);
                    }
                }
            }

            // Создаем и отправляем offer
            console.log(`Создаем offer для ${userId}`);
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await peerConnection.setLocalDescription(offer);

            const { error } = await supabase
                .from('audio_signaling')
                .insert({
                    sender_id: user.id,
                    receiver_id: userId,
                    session_id: sessionId,
                    offer: JSON.stringify(offer)
                });

            if (error) {
                console.error('Ошибка отправки offer:', error);
                throw error;
            }

            console.log(`Peer connection установлен для ${userId}`);

        } catch (error) {
            console.error(`Ошибка настройки соединения с ${userId}:`, error);

            // Ретрай механизм
            setTimeout(() => {
                if (audioCall.isCallActive && !peerConnections.current[userId]) {
                    console.log(`Повторная попытка соединения с ${userId}...`);
                    setupPeerConnection(userId, sessionId);
                }
            }, 3000);
        }
    };

    // Очистка звонка
    const cleanupCall = async (fullCleanup = false) => {
        setScreenShareParticipants([]);
        setLocalScreenShare({ stream: null, isFullscreen: false, isMinimized: false });

        if (audioChannels.current.screenSignaling) {
            supabase.removeChannel(audioChannels.current.screenSignaling);
        }

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }

        if (localVideoStream) {
            localVideoStream.getTracks().forEach(track => track.stop());
            setLocalVideoStream(null);
        }

        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            setScreenStream(null);
        }
            // Удаляем ВСЕ каналы
    Object.entries(audioChannels.current).forEach(([key, channel]) => {
        if (channel) {
            console.log(`Удаляем канал ${key}`);
            supabase.removeChannel(channel);
            delete audioChannels.current[key];
        }
    });
    
    // Обнуляем ссылки
    audioChannels.current = {
        participants: null,
        signaling: null,
        screenSignaling: null,
        session: null
    };
        Object.values(peerConnections.current).forEach(pc => pc.close());
        peerConnections.current = {};

        Object.values(remoteVideoRefs.current).forEach(video => {
            if (video && video.parentNode) {
                video.pause();
                video.srcObject = null;
                video.remove();
            }
        });
        remoteVideoRefs.current = {};

        Object.values(remoteScreenRefs.current).forEach(video => {
            if (video && video.parentNode) {
                video.pause();
                video.srcObject = null;
                video.remove();
            }
        });
        remoteScreenRefs.current = {};

        Object.values(remoteAudioRefs.current).forEach(audio => {
            if (audio && audio.parentNode) {
                audio.pause();
                audio.srcObject = null;
                audio.remove();
            }
        });
        remoteAudioRefs.current = {};

        Object.values(audioContexts.current).forEach(ctx => {
            try { ctx.close(); } catch (e) { }
        });
        audioContexts.current = {};

        Object.values(animationFrameIds.current).forEach(id => cancelAnimationFrame(id));
        animationFrameIds.current = {};

        Object.values(audioChannels.current).forEach(channel => {
            if (channel) supabase.removeChannel(channel);
        });

        pendingOffers.current = [];
        senderTrackLabels.current = {};

        if (fullCleanup) {
            setAudioParticipants([]);
        }

        setIsLocalStreamReady(false);
        isFirstRefresh.current = true;
    };

    const cleanupAllSubscriptions = () => {
    console.log('Очистка всех подписок');
    
    // Закрыть все каналы
    Object.values(audioChannels.current).forEach(channel => {
        if (channel) {
            try {
                supabase.removeChannel(channel);
            } catch (error) {
                console.warn('Ошибка при удалении канала:', error);
            }
        }
    });
    
    // Очистить ref
    audioChannels.current = {
        participants: null,
        signaling: null,
        screenSignaling: null,
        session: null
    };
    
    // Очистить pending offers
    pendingOffers.current = [];
};
    // Обработка входящего offer
    const handleIncomingOffer = async (senderId: string, offer: RTCSessionDescriptionInit, sessionId: string) => {
        if (!user || !audioCall.isCallActive) return;

        if (!localStream || !isLocalStreamReady) {
            console.log(`Откладываем offer от ${senderId}, локальный поток не готов`);
            pendingOffers.current.push({ senderId, offer, sessionId });
            return;
        }

        try {
            // Закрываем старое соединение
            if (peerConnections.current[senderId]) {
                peerConnections.current[senderId].close();
                delete peerConnections.current[senderId];
                delete senderTrackLabels.current[senderId];
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const peerConnection = new RTCPeerConnection({
                iceServers: iceServers.current,
                iceTransportPolicy: "all",
                bundlePolicy: "max-bundle",
                rtcpMuxPolicy: "require",
            });

            senderTrackLabels.current[senderId] = new Map();
            peerConnections.current[senderId] = peerConnection;

            // Устанавливаем обработчики событий
            peerConnection.oniceconnectionstatechange = () => {
                const state = peerConnection.iceConnectionState;
                console.log(`ICE состояние (ответ) для ${senderId}:`, state);

                if (state === 'disconnected' || state === 'failed') {
                    setTimeout(() => {
                        if (audioCall.isCallActive && !peerConnections.current[senderId]) {
                            handleIncomingOffer(senderId, offer, sessionId);
                        }
                    }, 2000);
                }

                checkActiveConnections();
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    supabase
                        .from('audio_signaling')
                        .insert({
                            sender_id: user.id,
                            receiver_id: senderId,
                            session_id: sessionId,
                            ice_candidate: JSON.stringify(event.candidate.toJSON())
                        })
                        .then(({ error }) => {
                            if (error) console.error('Ошибка отправки ICE (ответ):', error);
                        });
                }
            };

            peerConnection.ontrack = (event) => {
                console.log(`Получен трек (ответ) от ${senderId}:`, {
                    kind: event.track.kind,
                    label: event.track.label
                });

                if (event.track.kind === 'video') {
                    const videoStream = new MediaStream([event.track]);
                    handleRemoteStream(senderId, videoStream, event.track);
                } else {
                    handleRemoteStream(senderId, event.streams[0], event.track);
                }
            };

            // Сначала добавляем наши треки
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                peerConnection.addTrack(audioTrack, localStream);
            }

            if (localVideoStream && localVideoStream.getVideoTracks().length > 0) {
                const videoTrack = localVideoStream.getVideoTracks()[0];
                if (videoTrack) {
                    const extendedTrack = videoTrack as ExtendedMediaStreamTrack;
                    extendedTrack._customLabel = 'camera';
                    const sender = peerConnection.addTrack(extendedTrack, localVideoStream);
                    senderTrackLabels.current[senderId].set('camera', sender);
                }
            }

            if (screenStream && screenStream.getVideoTracks().length > 0) {
                const screenTrack = screenStream.getVideoTracks()[0];
                if (screenTrack) {
                    const extendedTrack = screenTrack as ExtendedMediaStreamTrack;
                    extendedTrack._customLabel = 'screen';
                    const sender = peerConnection.addTrack(extendedTrack, screenStream);
                    senderTrackLabels.current[senderId].set('screen', sender);
                }
            }

            // Устанавливаем удаленное описание
            console.log(`Устанавливаем удаленный offer от ${senderId}`);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            // Создаем и отправляем answer
            const answer = await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await peerConnection.setLocalDescription(answer);

            const { error } = await supabase
                .from('audio_signaling')
                .insert({
                    sender_id: user.id,
                    receiver_id: senderId,
                    session_id: sessionId,
                    answer: JSON.stringify(answer)
                });

            if (error) {
                console.error('Ошибка отправки answer:', error);
                throw error;
            }

            console.log(`Ответ отправлен для ${senderId}`);

        } catch (error) {
            console.error(`Ошибка обработки offer от ${senderId}:`, error);

            pendingOffers.current.push({ senderId, offer, sessionId });

            setTimeout(() => {
                if (audioCall.isCallActive && user && localStream) {
                    console.log(`Повторная обработка offer от ${senderId}`);
                    handleIncomingOffer(senderId, offer, sessionId);
                }
            }, 2000);
        }
    };

// Обработка входящего answer - ИСПРАВЛЕННАЯ ВЕРСИЯ
const handleIncomingAnswer = async (senderId: string, answer: RTCSessionDescriptionInit) => {
    const peerConnection = peerConnections.current[senderId];
    if (!peerConnection) {
        console.warn(`Peer connection не найден для ${senderId}`);
        return;
    }
    
    // Проверяем состояние перед установкой answer
    if (peerConnection.signalingState === 'stable') {
        console.log(`Answer для ${senderId} уже был обработан, игнорируем`);
        return;
    }
    
    if (peerConnection.signalingState !== 'have-local-offer') {
        console.warn(`Некорректное состояние для установки answer (${senderId}): ${peerConnection.signalingState}`);
        
        // Если состояние не "have-local-offer", откладываем обработку
        console.log(`Откладываем обработку answer для ${senderId}`);
        setTimeout(() => {
            handleIncomingAnswer(senderId, answer);
        }, 100);
        return;
    }
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`✅ Answer успешно установлен для ${senderId}`);
    } catch (error) {
        console.error(`❌ Ошибка при установке answer для ${senderId}:`, error);
    }
};

    // Обработка входящего ICE кандидата
    const handleIncomingIceCandidate = async (senderId: string, candidate: RTCIceCandidateInit) => {
        const peerConnection = peerConnections.current[senderId];
        if (!peerConnection || !peerConnection.remoteDescription) return;
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Ошибка при добавлении ICE кандидата:', error);
        }
    };

// Обработка удаленного потока - ИСПРАВЛЕННАЯ ВЕРСИЯ
const handleRemoteStream = async (userId: string, stream: MediaStream, track: MediaStreamTrack) => {
  console.log(`[%cHANDLE STREAM] Обработка потока от ${userId}`, 'color: yellow; font-weight: bold;', {
    kind: track.kind,
    streamId: stream.id,
    trackId: track.id,
    trackLabel: (track as ExtendedMediaStreamTrack)._customLabel,
    trackKind: track.kind,
    streamTracks: stream.getTracks().length,
    timestamp: new Date().toISOString()
  });

  const isVideoTrack = track.kind === 'video';
  console.log(`Обработка потока от ${userId}:`, {
    kind: track.kind,
    video: isVideoTrack,
    streamId: stream.id,
    trackLabel: (track as ExtendedMediaStreamTrack)._customLabel,
    trackId: track.id
  });

  if (isVideoTrack) {
    // === КРИТИЧЕСКИ ВАЖНО: определяем тип видео ПО МЕТКЕ ТРЕКА, а не по состоянию ===
    const extendedTrack = track as ExtendedMediaStreamTrack;
    const trackLabel = extendedTrack._customLabel;

    console.log(`[%cVIDEO TRACK] Трек от ${userId}:`, 'color: green; font-weight: bold;', {
      trackLabel,
      hasCustomLabel: !!trackLabel,
      isCamera: trackLabel === 'camera',
      isScreen: trackLabel === 'screen',
      isUnlabeled: !trackLabel
    });

    // Если трек имеет метку 'camera' или 'screen' — используем её
    if (trackLabel === 'camera' || trackLabel === 'screen') {
      const isScreenShare = trackLabel === 'screen';

      // Обновляем состояние участника
      setAudioParticipants(prev =>
        prev.map(p => {
          if (p.userId === userId) {
            return {
              ...p,
              ...(isScreenShare
                ? { remoteScreenStream: stream, isSharingScreen: true, remoteVideoStream: null }
                : { remoteVideoStream: stream, hasVideo: true, remoteScreenStream: null }
              )
            };
          }
          return p;
        })
      );

      // Для screen share добавляем в отдельный список
      if (isScreenShare) {
        setScreenShareParticipants(prev => {
          const existingIndex = prev.findIndex(p => p.userId === userId);
          const participant = audioParticipants.find(p => p.userId === userId);

          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              stream
            };
            return updated;
          }

          return [...prev, {
            userId,
            name: participant?.name || 'Unknown',
            stream,
            isFullscreen: false,
            isMinimized: false
          }];
        });
      }

      console.log(`Видео от ${userId} обработано по метке "${trackLabel}"`);
      return;
    }

// === Если метка отсутствует — запрашиваем актуальное состояние из БД ===
console.warn(`Трек от ${userId} без метки _customLabel! Запрашиваем из БД...`);
try {
  const { data: participantData, error } = await supabase
    .from('audio_participants')
    .select('stream, has_video')
    .eq('session_id', audioCall.currentSessionId)
    .eq('user_id', userId)
    .is('leave_time', null)
    .single();

  if (error) throw error;

  const isScreenShare = participantData?.stream || false;
  const hasVideo = participantData?.has_video || false;

  // 🔥 КЛЮЧЕВАЯ ПРОВЕРКА: если ни экран, ни камера — игнорируем поток
  if (!isScreenShare && !hasVideo) {
    console.warn(`Поток от ${userId} не соответствует активной камере или экрану. Игнорируем.`);
    return;
  }

  // Обновляем состояние только если есть активный тип
  setAudioParticipants(prev =>
    prev.map(p => {
      if (p.userId === userId) {
        return {
          ...p,
          ...(isScreenShare
            ? { remoteScreenStream: stream, isSharingScreen: true, remoteVideoStream: null }
            : { remoteVideoStream: stream, hasVideo: true, remoteScreenStream: null }
          )
        };
      }
      return p;
    })
  );

  if (isScreenShare) {
    setScreenShareParticipants(prev => {
      const existingIndex = prev.findIndex(p => p.userId === userId);
      const participant = audioParticipants.find(p => p.userId === userId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], stream };
        return updated;
      }
      return [
        ...prev,
        {
          userId,
          name: participant?.name || 'Unknown',
          stream,
          isFullscreen: false,
          isMinimized: false
        }
      ];
    });
  }

  console.log(`Видео от ${userId} обработано по данным из БД: ${isScreenShare ? 'screen' : 'camera'}`);
} catch (error) {
  console.error(`Ошибка запроса к БД для ${userId}:`, error);
  // Без данных из БД — НЕ показываем поток
  console.warn(`Не удалось определить тип потока от ${userId}. Поток проигнорирован.`);
  return;
}

// ДОБАВЬТЕ ЭТУ ПРОВЕРКУ ПОСЛЕ УСПЕШНОГО ЗАПРОСА:
const isScreenShare = participantData?.stream || false;
const hasVideo = participantData?.has_video || false;

// Если ни экран, ни камера — игнорируем поток
if (!isScreenShare && !hasVideo) {
  console.warn(`Поток от ${userId} не соответствует активной камере или экрану. Игнорируем.`);
  return;
}

// Только теперь обновляем состояние
setAudioParticipants(prev =>
  prev.map(p => {
    if (p.userId === userId) {
      return {
        ...p,
        ...(isScreenShare
          ? { remoteScreenStream: stream, isSharingScreen: true, remoteVideoStream: null }
          : { remoteVideoStream: stream, hasVideo: true, remoteScreenStream: null }
        )
      };
    }
    return p;
  })
);

    return;
  }

  // === Обработка аудио (без изменений) ===
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return;

  let audioElement = remoteAudioRefs.current[userId];
  if (!audioElement) {
    audioElement = document.createElement('audio');
    audioElement.id = `remote-audio-${userId}`;
    audioElement.autoplay = true;
    audioElement.controls = false;
    audioElement.style.display = 'none';
    audioElement.playsInline = true;
    remoteAudioRefs.current[userId] = audioElement;
    document.body.appendChild(audioElement);
  }

  audioElement.srcObject = stream;
  audioElement.muted = audioCall.isSpeakerMuted;

  const playAudio = () => {
    audioElement.play()
      .then(() => {
        console.log(`Аудио воспроизводится для ${userId}`);
        setAudioParticipants(prev =>
          prev.map(p => p.userId === userId ? { ...p, isSpeaking: true } : p)
        );
        analyzeAudioLevel(userId, stream);
      })
      .catch(error => {
        console.error(`Ошибка воспроизведения аудио для ${userId}:`, error);
        if (error.name === 'NotAllowedError') {
          audioElement.muted = true;
          setTimeout(() => {
            audioElement.play()
              .then(() => {
                audioElement.muted = audioCall.isSpeakerMuted;
                console.log(`Аудио восстановлено для ${userId}`);
              })
              .catch(e => console.error(`Ретрай не удался:`, e));
          }, 1000);
        }
      });
  };

  setTimeout(playAudio, 100);
};

    // Анализ уровня аудио
    const analyzeAudioLevel = (userId: string, stream: MediaStream) => {
        if (audioContexts.current[userId]) {
            try { audioContexts.current[userId].close(); } catch (e) { }
        }
        if (animationFrameIds.current[userId]) {
            cancelAnimationFrame(animationFrameIds.current[userId]);
            delete animationFrameIds.current[userId];
        }

        try {
            const audioContext = new AudioContext();
            audioContexts.current[userId] = audioContext;

            const analyser = audioContext.createAnalyser();
            analysers.current[userId] = analyser;

            const microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);

            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            let isSpeaking = false;

            const checkVolume = () => {
                if (!analysers.current[userId]) return;

                analyser.getByteFrequencyData(dataArray);

                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;

                const threshold = 20;
                const newIsSpeaking = average > threshold;

                if (newIsSpeaking !== isSpeaking) {
                    isSpeaking = newIsSpeaking;

                    setAudioParticipants(prev =>
                        prev.map(p =>
                            p.userId === userId
                                ? { ...p, isSpeaking }
                                : p
                        )
                    );

                    if (audioCall.currentSessionId && userId === user?.id) {
                        supabase
                            .from('audio_participants')
                            .update({ is_speaking: isSpeaking })
                            .eq('session_id', audioCall.currentSessionId)
                            .eq('user_id', user.id)
                            .then(({ error }) => {
                                if (error) console.error('Ошибка обновления статуса говорящего:', error);
                            });
                    }
                }

                if (audioParticipants.some(p => p.userId === userId) && analysers.current[userId]) {
                    animationFrameIds.current[userId] = requestAnimationFrame(checkVolume);
                }
            };

            animationFrameIds.current[userId] = requestAnimationFrame(checkVolume);
        } catch (error) {
            console.error('Ошибка анализа аудио:', error);
        }
    };

    // Переключение микрофона
    const toggleMute = async () => {
        if (!hasActiveConnections) {
            toast.error('Нет активных соединений. Микрофон заблокирован');
            return;
        }
        if (!localStream || !audioCall.currentSessionId) return;

        const newMutedState = !audioCall.isMuted;

        try {
            const audioTracks = localStream.getAudioTracks();
            if (audioTracks.length === 0) throw new Error('Нет доступных аудио треков');

            audioTracks.forEach(track => track.enabled = !newMutedState);

            audioCall.setMuteState(newMutedState);

            const updateSuccess = await updateParticipantMuteStatus(audioCall.currentSessionId, newMutedState);
            if (!updateSuccess) throw new Error('Не удалось обновить статус микрофона на сервере');

            setAudioParticipants(prev =>
                prev.map(p => p.userId === user?.id ? { ...p, isMuted: newMutedState } : p)
            );

            updateAllPeerConnections();

            toast.success(newMutedState ? 'Микрофон выключен' : 'Микрофон включен');

        } catch (error) {
            console.error('Ошибка при переключении микрофона:', error);
            toast.error('Не удалось переключить микрофон');

            localStream.getAudioTracks().forEach(track => track.enabled = !audioCall.isMuted);
            audioCall.setMuteState(!audioCall.isMuted);
        }
    };

    // Переключение динамика
    const toggleSpeaker = () => {
        const newState = !audioCall.isSpeakerMuted;
        audioCall.toggleSpeaker();

        Object.values(remoteAudioRefs.current).forEach(audio => {
            if (audio) audio.muted = newState;
        });
    };

    // Переключение камеры - УЛУЧШЕННАЯ ВЕРСИЯ
    const toggleVideo = async () => {
        if (!hasActiveConnections) {
            toast.error('Нет активных соединений. Камера заблокирована');
            return;
        }
        if (!audioCall.currentSessionId) return;

        const newVideoState = !localVideoStream;

        try {
            if (newVideoState) {
                // Включаем камеру
                console.log('Включаем камеру...');
                const videoStream = await getUserMediaStream(true);
                setLocalVideoStream(videoStream);

                const videoTrack = videoStream.getVideoTracks()[0];
                if (videoTrack) {
                    const extendedTrack = videoTrack as ExtendedMediaStreamTrack;
                    extendedTrack._customLabel = 'camera';

                    // Обновляем соединения
                    console.log('Обновляем peer connections с видео треком');
                    updateAllPeerConnections();

                    // Обработчик окончания трека
                    videoTrack.onended = () => {
                        console.log('Камера была отключена (трек завершен)');
                        setLocalVideoStream(null);
                        updateParticipantVideoStatus(audioCall.currentSessionId!, false);
                        setAudioParticipants(prev => prev.map(p =>
                            p.userId === user?.id ? { ...p, hasVideo: false } : p
                        ));
                        toast.info('Камера была отключена');
                    };

                    // Обновляем статус на сервере
                    await updateParticipantVideoStatus(audioCall.currentSessionId, true);

                    // Обновляем локальное состояние
                    setAudioParticipants(prev =>
                        prev.map(p => p.userId === user?.id ? { ...p, hasVideo: true } : p)
                    );

                    toast.success('Камера включена');
                    console.log("Камера включена, треки отправлены");
                }
            } else {
                // Выключаем камеру
                console.log('Выключаем камеру...');
                if (localVideoStream) {
                    localVideoStream.getTracks().forEach(track => {
                        track.stop();
                        track.enabled = false;
                    });
                    setLocalVideoStream(null);
                }

                // Обновляем соединения (удаляем видео трек)
                console.log('Обновляем peer connections без видео трека');
                updateAllPeerConnections();

                // Обновляем статус на сервере
                await updateParticipantVideoStatus(audioCall.currentSessionId, false);

                // Обновляем локальное состояние
                setAudioParticipants(prev =>
                    prev.map(p => p.userId === user?.id ? { ...p, hasVideo: false } : p)
                );

                toast.success('Камера выключена');
            }
        } catch (error) {
            console.error('Ошибка при переключении камеры:', error);

            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                toast.error('Доступ к камере запрещен. Проверьте настройки браузера');
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                toast.error('Камера не найдена. Проверьте подключение устройства');
            } else {
                toast.error('Не удалось включить камеру');
            }

            // Откат состояний
            if (localVideoStream) {
                localVideoStream.getTracks().forEach(track => track.stop());
                setLocalVideoStream(null);
            }

            updateAllPeerConnections();
        }
    };

    // Переключение демонстрации экрана - УЛУЧШЕННАЯ ВЕРСИЯ
    const toggleScreenShare = async () => {
        if (screenStream) {
            // Останавливаем демонстрацию
            screenStream.getTracks().forEach(track => track.stop());
            setScreenStream(null);
            setLocalScreenShare({ stream: null, isFullscreen: false, isMinimized: false });

            if (audioCall.currentSessionId && user) {
                await supabase
                    .from('audio_participants')
                    .update({ stream: false })
                    .eq('session_id', audioCall.currentSessionId)
                    .eq('user_id', user.id);
            }

            await supabase
                .from('screen_signaling')
                .insert({
                    sender_id: user?.id,
                    session_id: audioCall.currentSessionId,
                    action: 'stop',
                    timestamp: new Date().toISOString()
                });

            updateAllPeerConnections();

            toast.success('Демонстрация экрана остановлена');
        } else {
            // Начинаем демонстрацию
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'always',
                        displaySurface: 'window',
                        frameRate: { ideal: 30 },
                        width: { ideal: 2560 },
                        height: { ideal: 1440 }
                    } as MediaTrackConstraints,
                    audio: false
                });

                setScreenStream(stream);
                setLocalScreenShare({
                    stream,
                    isFullscreen: false,
                    isMinimized: false
                });

                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) {
                    const extendedTrack = videoTrack as ExtendedMediaStreamTrack;
                    extendedTrack._customLabel = 'screen';

                    // Обновляем все соединения
                    updateAllPeerConnections();

                    if (audioCall.currentSessionId && user) {
                        await supabase
                            .from('audio_participants')
                            .update({ stream: true })
                            .eq('session_id', audioCall.currentSessionId)
                            .eq('user_id', user.id);
                    }

                    await supabase
                        .from('screen_signaling')
                        .insert({
                            sender_id: user?.id,
                            session_id: audioCall.currentSessionId,
                            action: 'start',
                            timestamp: new Date().toISOString()
                        });

                    videoTrack.onended = () => {
                        console.log('Screen sharing track ended');
                        toggleScreenShare();
                    };

                    toast.success('Демонстрация экрана начата');
                }
            } catch (error) {
                console.error('Ошибка демонстрации экрана:', error);
                if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') {
                    toast.error('Не удалось начать демонстрацию экрана');
                }
            }
        }
    };

    // Выход из звонка
    const leaveCall = async () => {
        if (audioCall.currentSessionId && user) {
            await removeParticipantFromSession(audioCall.currentSessionId);

            const { data: participants, error } = await supabase
                .from('audio_participants')
                .select('user_id')
                .eq('session_id', audioCall.currentSessionId)
                .is('leave_time', null);

            if (!error && participants && participants.length === 0) {
                await supabase
                    .from('audio_sessions')
                    .update({
                        status: 'ended',
                        end_time: new Date().toISOString()
                    })
                    .eq('id', audioCall.currentSessionId);

                await cleanupSessionSignals(audioCall.currentSessionId);
            }
        }

        audioCall.stopCall();
        await cleanupCall(true);
        onClose?.();
    };

    // Управление отображением экрана
    const toggleScreenFullscreen = (userId: string) => {
        if (userId === user?.id) {
            setLocalScreenShare(prev => ({ ...prev, isFullscreen: !prev.isFullscreen, isMinimized: false }));
        } else {
            setScreenShareParticipants(prev =>
                prev.map(p =>
                    p.userId === userId
                        ? { ...p, isFullscreen: !p.isFullscreen, isMinimized: false }
                        : p
                )
            );
        }
    };

    const toggleScreenMinimize = (userId: string) => {
        if (userId === user?.id) {
            setLocalScreenShare(prev => ({ ...prev, isMinimized: !prev.isMinimized, isFullscreen: false }));
        } else {
            setScreenShareParticipants(prev =>
                prev.map(p =>
                    p.userId === userId
                        ? { ...p, isMinimized: !p.isMinimized, isFullscreen: false }
                        : p
                )
            );
        }
    };

    const closeScreenView = (userId: string) => {
        if (userId === user?.id) {
            setLocalScreenShare({ stream: null, isFullscreen: false, isMinimized: false });
        } else {
            setScreenShareParticipants(prev =>
                prev.filter(p => p.userId !== userId)
            );
        }
    };

    // Подписка на сигнализацию экрана
    const subscribeToScreenSignaling = (sessionId: string) => {
        if (!user) return;
        if (audioChannels.current.screenSignaling) {
            supabase.removeChannel(audioChannels.current.screenSignaling);
        }

        const channel = supabase.channel(`screen_signaling_${sessionId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'screen_signaling',
                    filter: `session_id=eq.${sessionId}`
                },
                async (payload) => {
                    if (payload.new.sender_id === user.id) return;

                    if (payload.new.action === 'start') {
                        const { data: userData } = await supabase
                            .from('users')
                            .select('name')
                            .eq('id', payload.new.sender_id)
                            .single();

                        setScreenShareParticipants(prev => [
                            ...prev.filter(p => p.userId !== payload.new.sender_id),
                            {
                                userId: payload.new.sender_id,
                                name: userData?.name || 'Unknown',
                                stream: null,
                                isFullscreen: false,
                                isMinimized: false
                            }
                        ]);
                    } else if (payload.new.action === 'stop') {
                        setScreenShareParticipants(prev =>
                            prev.filter(p => p.userId !== payload.new.sender_id)
                        );

                        setAudioParticipants(prev => prev.map(p =>
                            p.userId === payload.new.sender_id
                                ? { ...p, remoteScreenStream: null }
                                : p
                        ));
                    }
                }
            )
            .subscribe();

        audioChannels.current.screenSignaling = channel;
    };

    // Подписка на изменения участников
    const subscribeToParticipantsChanges = (sessionId: string) => {
        if (!user) return;
        if (audioChannels.current.participants) {
            supabase.removeChannel(audioChannels.current.participants);
        }

        const channel = supabase.channel(`persistent_participants_${sessionId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'audio_participants',
                    filter: `session_id=eq.${sessionId}`
                },
                async (payload) => {
                    if (payload.new.user_id !== user.id) {
                        await updateParticipantsList(sessionId);
                        return;
                    }

                    if (payload.eventType === 'UPDATE') {
                        setAudioParticipants(prev =>
                            prev.map(p =>
                                p.userId === user.id
                                    ? {
                                        ...p,
                                        isMuted: payload.new.is_muted ?? p.isMuted,
                                        isSpeaking: payload.new.is_speaking ?? p.isSpeaking,
                                        isSharingScreen: payload.new.stream ?? p.isSharingScreen,
                                        hasVideo: payload.new.has_video ?? p.hasVideo
                                    }
                                    : p
                            )
                        );

                        if (payload.new.leave_time) {
                            handleParticipantLeave(user.id);
                        }
                    } else if (payload.eventType === 'DELETE') {
                        handleParticipantLeave(user.id);
                    }
                }
            )
            .subscribe();

        audioChannels.current.participants = channel;
    };

    // Подписка на сигнализацию
// Подписка на сигнализацию - УЛУЧШЕННАЯ ВЕРСИЯ
const subscribeToSignaling = (sessionId: string) => {
    if (!user || audioChannels.current.signaling) return;
    
    // Храним обработанные сигналы для дедупликации
    const processedSignals = new Set<string>();
    
    try {
        const channel = supabase.channel(`persistent_signaling_${user.id}_${Date.now()}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'audio_signaling',
                    filter: `receiver_id=eq.${user.id}`
                },
                async (payload) => {
                    if (!audioCall.isCallActive) return;
                    
                    // Дедупликация: проверяем, не обработан ли уже этот сигнал
                    const signalId = `${payload.new.sender_id}-${payload.new.session_id}-${payload.new.offer || payload.new.answer || payload.new.ice_candidate}`;
                    if (processedSignals.has(signalId)) {
                        console.debug('Дублирующий сигнал, игнорируем');
                        return;
                    }
                    processedSignals.add(signalId);
                    
                    // Очищаем старые сигналы каждые 30 секунд
                    if (processedSignals.size > 100) {
                        processedSignals.clear();
                    }
                    
                    // Проверяем актуальность сигнала (не старше 10 секунд)
                    const timestamp = new Date(payload.new.timestamp || Date.now());
                    const now = new Date();
                    if (now.getTime() - timestamp.getTime() > 10000) {
                        console.warn('Игнорируем устаревший сигнал');
                        return;
                    }
                    
                    if (payload.new.offer) {
                        await handleIncomingOffer(
                            payload.new.sender_id,
                            JSON.parse(payload.new.offer),
                            payload.new.session_id
                        );
                    } else if (payload.new.answer) {
                        await handleIncomingAnswer(
                            payload.new.sender_id,
                            JSON.parse(payload.new.answer)
                        );
                    } else if (payload.new.ice_candidate) {
                        await handleIncomingIceCandidate(
                            payload.new.sender_id,
                            JSON.parse(payload.new.ice_candidate)
                        );
                    }
                }
            )
            .subscribe((status) => {
                console.log('Signaling channel status:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('Signaling channel subscribed');
                }
            });
        
        audioChannels.current.signaling = channel;
    } catch (error) {
        console.error('Ошибка создания signaling канала:', error);
    }
};

    // Подписка на изменения сессии
    const subscribeToSessionChanges = (lobbyId: string) => {
        if (!user) return;
        if (audioChannels.current.session) {
            supabase.removeChannel(audioChannels.current.session);
        }

        const channel = supabase.channel(`persistent_session_${lobbyId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'audio_sessions',
                    filter: `lobby_id=eq.${lobbyId}`
                },
                async (payload) => {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        if (payload.new.status === 'active') {
                            if (!audioCall.isCallActive && user) {
                                const { data: participant } = await supabase
                                    .from('audio_participants')
                                    .select('*')
                                    .eq('session_id', payload.new.id)
                                    .eq('user_id', user.id)
                                    .is('leave_time', null)
                                    .maybeSingle();

                                if (participant) {
                                    audioCall.startCall(lobbyId, payload.new.id);
                                }
                            }
                        } else if (payload.new.status === 'ended') {
                            if (audioCall.currentSessionId === payload.new.id) {
                                await cleanupCall();
                                audioCall.stopCall();
                            }
                        }
                    }
                }
            )
            .subscribe();

        audioChannels.current.session = channel;
    };

    // Обновление звонка
    const refreshCall = async (preserveMuteState?: boolean) => {
        if (!audioCall.isCallActive || !audioCall.currentSessionId) return;

        const activeConnections = Object.values(peerConnections.current).filter(pc =>
            pc.iceConnectionState === 'connected' ||
            pc.iceConnectionState === 'completed'
        );

        const checkingConnections = Object.values(peerConnections.current).filter(pc =>
            pc.iceConnectionState === 'checking'
        );

        if (activeConnections.length > 0) {
            toast.info('Соединение активно');
            return;
        }

        if (checkingConnections.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            const stillChecking = checkingConnections.filter(pc => pc.iceConnectionState === 'checking');

            if (stillChecking.length === 0) {
                return;
            }
        }

        const currentSessionId = audioCall.currentSessionId;
        const currentMuteState = preserveMuteState !== undefined ? preserveMuteState : audioCall.isMuted;
        const isSpeakerMuted = audioCall.isSpeakerMuted;

        try {
            audioCall.setMuteState(currentMuteState);

            Object.entries(peerConnections.current).forEach(([userId, pc]) => {
                try {
                    if (pc.iceConnectionState !== 'closed' && pc.signalingState !== 'closed') {
                        pc.close();
                    }
                    delete peerConnections.current[userId];
                } catch (error) {
                    console.warn(`Ошибка при закрытии соединения:`, error);
                }
            });

            pendingOffers.current = [];
            await new Promise(resolve => setTimeout(resolve, 300));

            if (isSpeakerMuted !== audioCall.isSpeakerMuted) {
                audioCall.toggleSpeaker();
            }

            await initializeCall(currentSessionId, currentMuteState);
            toast.success('Соединение восстановлено');

        } catch (error) {
            console.error('Ошибка при рефреше звонка:', error);

            if (localStream) {
                localStream.getAudioTracks().forEach(track => track.enabled = !currentMuteState);
            }

            toast.error('Не удалось восстановить соединение');

            setTimeout(() => {
                if (audioCall.isCallActive && audioCall.currentSessionId) {
                    refreshCall(currentMuteState).catch(console.error);
                }
            }, 3000);

            throw error;
        }
    };

    // Обновление списка участников
const updateParticipantsList = async (sessionId: string) => {
  try {
    const participantsFromDb = await getSessionParticipants(sessionId);
    setAudioParticipants(prev => {
      const preservedStreams = new Map<string, {
        remoteVideoStream: MediaStream | null;
        remoteScreenStream: MediaStream | null;
      }>();

      // Сохраняем только активные потоки, которые ещё актуальны
      prev.forEach(p => {
        preservedStreams.set(p.userId, {
          remoteVideoStream: p.remoteVideoStream,
          remoteScreenStream: p.remoteScreenStream
        });
      });

      return participantsFromDb.map(dbP => {
        const localState = preservedStreams.get(dbP.userId);
        const isLocal = dbP.userId === user?.id;

        // Для удалённых пользователей: если в БД has_video=false → убираем поток
        const remoteVideoStream = !isLocal && !dbP.hasVideo
          ? null
          : localState?.remoteVideoStream || null;

        // Если в БД stream=false → убираем screen stream
        const remoteScreenStream = !isLocal && !dbP.isSharingScreen
          ? null
          : localState?.remoteScreenStream || null;

        return {
          ...dbP,
          remoteVideoStream,
          remoteScreenStream,
          name: isLocal ? (dbP.name || "Вы") : dbP.name,
          avatarUrl: isLocal ? (dbP.avatarUrl || null) : dbP.avatarUrl
        };
      });
    });

    // Синхронизируем screenShareParticipants с isSharingScreen
    setScreenShareParticipants(prev => {
      const activeScreenSharers = participantsFromDb
        .filter(p => p.isSharingScreen && p.userId !== user?.id)
        .map(p => {
          const existing = prev.find(sp => sp.userId === p.userId);
          return {
            userId: p.userId,
            name: p.name || 'Unknown',
            stream: existing?.stream || null, // сохраняем поток, если есть
            isFullscreen: existing?.isFullscreen || false,
            isMinimized: existing?.isMinimized || false
          };
        });
      return activeScreenSharers;
    });

  } catch (error) {
    console.error('Ошибка обновления участников:', error);
  }
};

    // Обработка выхода участника
    const handleParticipantLeave = (userId: string) => {
        setAudioParticipants(prev =>
            prev.filter(p => p.userId !== userId)
        );

        if (peerConnections.current[userId]) {
            peerConnections.current[userId].close();
            delete peerConnections.current[userId];
        }

        if (remoteVideoRefs.current[userId]) {
            const videoEl = remoteVideoRefs.current[userId];
            if (videoEl && videoEl.parentNode) {
                videoEl.pause();
                videoEl.srcObject = null;
                videoEl.remove();
            }
            delete remoteVideoRefs.current[userId];
        }

        if (remoteScreenRefs.current[userId]) {
            const screenEl = remoteScreenRefs.current[userId];
            if (screenEl && screenEl.parentNode) {
                screenEl.pause();
                screenEl.srcObject = null;
                screenEl.remove();
            }
            delete remoteScreenRefs.current[userId];
        }

        if (remoteAudioRefs.current[userId]) {
            const audioEl = remoteAudioRefs.current[userId];
            if (audioEl && audioEl.parentNode) {
                audioEl.pause();
                audioEl.srcObject = null;
                audioEl.remove();
            }
            delete remoteAudioRefs.current[userId];
        }

        if (audioContexts.current[userId]) {
            try { audioContexts.current[userId].close(); } catch (e) { }
            delete audioContexts.current[userId];
        }

        if (animationFrameIds.current[userId]) {
            cancelAnimationFrame(animationFrameIds.current[userId]);
            delete animationFrameIds.current[userId];
        }

        if (analysers.current[userId]) {
            delete analysers.current[userId];
        }
    };

    const toggleMinimize = () => {
        setIsMinimized(!isMinimized);
        onMinimize?.();
    };

    // Инициализация звонка при активации
useEffect(() => {
  if (!audioCall.isCallActive) {
    cleanupCall();
    hasInitializedRef.current = false;
    return;
  }

  if (audioCall.isCallActive && audioCall.currentSessionId && user && !hasInitializedRef.current) {
    hasInitializedRef.current = true;
    initializeCall(audioCall.currentSessionId);
  }
}, [audioCall.isCallActive, audioCall.currentSessionId, user]);

useEffect(() => {
  return () => {
    hasInitializedRef.current = false;
  };
}, []);

    // Обработка отложенных предложений
    useEffect(() => {
        if (isLocalStreamReady && localStream && pendingOffers.current.length > 0) {
            processPendingOffers();
        }
    }, [isLocalStreamReady, localStream]);

    // Обновление всех соединений при изменении потоков
useEffect(() => {
  const handleVisibilityChange = () => {
    // Ничего не делаем при скрытии вкладки
  };

  const observer = new IntersectionObserver(() => {
    // Не используется, просто для совместимости
  });

  // Проверяем видимость вкладки
  const updateIfVisible = () => {
    if (document.visibilityState === 'visible') {
      if (audioCall.isCallActive && isLocalStreamReady) {
        updateAllPeerConnections();
      }
    }
  };

  // Сначала проверяем сразу
  updateIfVisible();

  // Подписываемся на изменения видимости
  document.addEventListener('visibilitychange', updateIfVisible);

  return () => {
    document.removeEventListener('visibilitychange', updateIfVisible);
    observer.disconnect();
  };
}, [localStream, localVideoStream, screenStream, audioCall.isCallActive, isLocalStreamReady, updateAllPeerConnections]);

    // Для локального экрана
    useEffect(() => {
        if (localScreenVideoRef.current) {
            localScreenVideoRef.current.srcObject = localScreenShare.stream;
            if (localScreenShare.stream) {
                localScreenVideoRef.current.play().catch(e => console.warn("Local screen play failed:", e));
            }
        }
    }, [localScreenShare.stream]);

    // Для локального видео
    useEffect(() => {
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = localVideoStream;
            if (localVideoStream) {
                localVideoRef.current.play().catch(e => console.warn("Local video play failed:", e));
            }
        }
    }, [localVideoStream]);

    // Проверка соединений при изменении количества peer
    useEffect(() => {
        if (audioCall.isCallActive) {
            checkActiveConnections();
        }
    }, [Object.keys(peerConnections.current).length, audioCall.isCallActive, checkActiveConnections]);

    // Автоматический сброс при потере соединений
    useEffect(() => {
        let timer: NodeJS.Timeout;

        const scheduleAutoReset = () => {
            if (audioCall.isCallActive &&
                audioCall.currentSessionId &&
                user &&
                localStream &&
                !isInitializing) {

                const hasActiveConnections = Object.values(peerConnections.current).some(pc =>
                    pc.iceConnectionState === 'connected' ||
                    pc.iceConnectionState === 'completed'
                );

                if (hasActiveConnections) {
                    isFirstRefresh.current = false;
                    return;
                }

                const delay = isFirstRefresh.current ? 1000 : 30000;

                timer = setTimeout(async () => {
                    if (audioCall.isCallActive && audioCall.currentSessionId && user && localStream) {
                        try {
                            await refreshCall(true);
                            toast.info('Соединение автоматически восстановлено');
                        } catch (error) {
                            console.warn('Предупреждение при автоматическом ресете:', error);
                        } finally {
                            isFirstRefresh.current = false;
                        }
                    }
                }, delay);
            }
        };

        scheduleAutoReset();

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [audioCall.isCallActive, audioCall.currentSessionId, user, localStream, isInitializing]);

    useEffect(() => {
    return () => {
        console.log('Компонент размонтируется - очищаем всё');
        
        // Очищаем все подписки
        cleanupAllSubscriptions();
        
        // Очищаем звонок
        cleanupCall(true).catch(console.error);
        
        // Если все еще в звонке - выходим
        if (audioCall.isCallActive) {
            leaveCall().catch(console.error);
        }
    };
}, []);

// В любое место компонента для отладки:
useEffect(() => {
    const interval = setInterval(() => {
        const activeChannels = Object.values(audioChannels.current)
            .filter(channel => channel !== null)
            .length;
        console.log(`Активные каналы: ${activeChannels}`);
    }, 30000);
    
    return () => clearInterval(interval);
}, []);

// Добавить в компонент
useEffect(() => {
  const participantsWithMissingStreams = audioParticipants.filter(
    p => p.userId !== user?.id && p.hasVideo && !p.remoteVideoStream
  );

  if (participantsWithMissingStreams.length > 0 && hasActiveConnections) {
    console.log('Обнаружены участники с камерой без потока:', 
      participantsWithMissingStreams.map(p => p.userId));
    
    // Можно инициировать переподключение
    participantsWithMissingStreams.forEach(participant => {
      const pc = peerConnections.current[participant.userId];
      if (pc && (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected')) {
        console.log(`Переподключение к ${participant.userId}`);
        if (audioCall.currentSessionId) {
          setupPeerConnection(participant.userId, audioCall.currentSessionId);
        }
      }
    });
  }
}, [audioParticipants, hasActiveConnections]);

    // Интервал проверки соединений
    useEffect(() => {
        const connectionCheckInterval = setInterval(() => {
            if (audioCall.isCallActive &&
                audioCall.currentSessionId &&
                user &&
                localStream &&
                !isInitializing) {

                const hasActiveConnections = Object.values(peerConnections.current).some(pc =>
                    pc.iceConnectionState === 'connected' ||
                    pc.iceConnectionState === 'completed'
                );

                if (!hasActiveConnections && !isFirstRefresh.current) {
                    const connectionCount = Object.keys(peerConnections.current).length;
                    if (connectionCount > 0) {
                        refreshCall(true).catch(console.error);
                    }
                }
            }
        }, 10000);

        return () => clearInterval(connectionCheckInterval);
    }, [audioCall.isCallActive, audioCall.currentSessionId, user, localStream, isInitializing]);

    if (!isVisible || !audioCall.isCallActive) {
        return null;
    }

    return (
        <CallContainer
            ref={containerRef}
            $isMinimized={isMinimized}
            style={{
                left: isMinimized ? 'auto' : `${position.x}px`,
                top: isMinimized ? 'auto' : `${position.y}px`,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            onMouseDown={handleMouseDown}
        >
            {isMinimized ? (
                <MinimizedView onClick={toggleMinimize}>
                    <FiHeadphones size={24} />
                    <span style={{ fontSize: '10px', marginTop: '4px' }}>
                        {audioParticipants.length}
                    </span>
                </MinimizedView>
            ) : (
                <>
                    <CallHeader>
                        <CallTitle>
                            <FiHeadphones size={16} />
                            Активный звонок ({audioParticipants.length})
                        </CallTitle>
                        <HeaderControls>
                            <ControlButton onClick={toggleMinimize}>
                                {isMinimized ? <FiMaximize2 size={14} /> : <FiMinimize2 size={14} />}
                            </ControlButton>
                            <ControlButton onClick={onClose}>
                                <FiX size={14} />
                            </ControlButton>
                        </HeaderControls>
                    </CallHeader>

                    <CallContent $isMinimized={false}>
                        <ParticipantsGrid>
                            {audioParticipants.map(participant => {
                                const isLocalUser = participant.userId === user?.id;
                                const isSharingScreen = participant.isSharingScreen;

                                // Показываем экран в отдельном компоненте, не в сетке аватарок
                                if (isLocalUser && localScreenShare.stream) {
                                    return null; // Экран будет показан в ScreenShareGrid
                                }

                                if (!isLocalUser && participant.remoteScreenStream) {
                                    return null; // Удаленные экраны будут в ScreenShareGrid
                                }

                                return (
                                    <ParticipantCard
                                        key={participant.userId}
                                        $speaking={participant.isSpeaking}
                                        $sharingScreen={isSharingScreen}
                                    >
                                        <ParticipantAvatar
                                            $src={participant.avatarUrl
                                                ? `https://api.naukaprosto.su/storage/v1/object/public/avatars${participant.avatarUrl}`
                                                : undefined
                                            }
                                        >
                                            {!participant.avatarUrl && <FiUser size={16} />}
                                            {isSharingScreen && (
                                                <ScreenShareIndicator>
                                                    <FiMonitor size={8} />
                                                </ScreenShareIndicator>
                                            )}
                                        </ParticipantAvatar>
                                        <ParticipantName>
                                            {participant.userId === user?.id ? 'Вы' : participant.name}
                                        </ParticipantName>
                                        <ParticipantStatus
                                            $muted={participant.isMuted}
                                            $sharingScreen={isSharingScreen}
                                        >
                                            {isSharingScreen ? (
                                                <>
                                                    <FiMonitor size={10} />
                                                    Демонстрация
                                                </>
                                            ) : participant.isMuted ? (
                                                <>
                                                    <FiMicOff size={10} />
                                                    Без звука
                                                </>
                                            ) : (
                                                <>
                                                    <FiMic size={10} />
                                                    Активен
                                                </>
                                            )}
                                        </ParticipantStatus>
                                    </ParticipantCard>
                                );
                            })}
                        </ParticipantsGrid>

                        {/* Видео камеры */}
                        <VideoGrid>
                            {/* Локальная камера */}
                            {localVideoStream && (
                                <VideoContainer $speaking={audioParticipants.find(p => p.userId === user?.id)?.isSpeaking}>
                                    <VideoElement
                                        ref={localVideoRef}
                                        autoPlay
                                        muted
                                        playsInline
                                        onLoadedMetadata={(e) => e.currentTarget.play().catch(console.warn)}
                                    />
                                    <VideoInfo>
                                        <VideoName>Вы (камера)</VideoName>
                                        <VideoStatus>
                                            {audioCall.isMuted ? (
                                                <FiMicOff size={10} title="Микрофон выключен" />
                                            ) : (
                                                <FiMic size={10} title="Микрофон включен" />
                                            )}
                                        </VideoStatus>
                                    </VideoInfo>
                                    <VideoControls className="video-controls">
                                        <VideoControlButton
                                            onClick={() => {
                                                if (localVideoStream) {
                                                    const track = localVideoStream.getVideoTracks()[0];
                                                    if (track) {
                                                        track.enabled = !track.enabled;
                                                    }
                                                }
                                            }}
                                            title="Отключить/включить камеру"
                                        >
                                            <FiVideoOff size={10} />
                                        </VideoControlButton>
                                    </VideoControls>
                                </VideoContainer>
                            )}

                            {/* Удаленные камеры */}
                            {audioParticipants
                                .filter(p => p.userId !== user?.id && p.remoteVideoStream)
                                .map(participant => (
                                    <VideoContainer
                                        key={`remote-video-${participant.userId}`}
                                        $speaking={participant.isSpeaking}
                                    >
                                        <VideoElement
                                            ref={(el) => {
                                                if (el && participant.remoteVideoStream && el.srcObject !== participant.remoteVideoStream) {
                                                    el.srcObject = participant.remoteVideoStream;
                                                    el.play().catch(console.warn);
                                                }
                                            }}
                                            autoPlay
                                            playsInline
                                            muted={false}
                                            onLoadedMetadata={(e) => e.currentTarget.play().catch(console.warn)}
                                            onError={(e) => {
                                                console.error('Video error:', e);
                                            }}
                                        />
                                        <VideoInfo>
                                            <VideoName>{participant.name}</VideoName>
                                            <VideoStatus>
                                                {participant.isMuted ? (
                                                    <FiMicOff size={10} title="Микрофон выключен" />
                                                ) : (
                                                    <FiMic size={10} title="Микрофон включен" />
                                                )}
                                            </VideoStatus>
                                        </VideoInfo>
                                        <VideoControls className="video-controls">
                                            <VideoControlButton
                                                onClick={() => {
                                                    const video = remoteVideoRefs.current[participant.userId];
                                                    if (video) {
                                                        video.muted = !video.muted;
                                                    }
                                                }}
                                                title="Отключить/включить звук"
                                            >
                                                <FiVolumeX size={10} />
                                            </VideoControlButton>
                                        </VideoControls>
                                    </VideoContainer>
                                ))}
                        </VideoGrid>

                        {/* Демонстрация экрана */}
                        {(localScreenShare.stream || screenShareParticipants.length > 0) && (
                            <ScreenShareGrid>
                                <h4>
                                    <FiMonitor size={14} />
                                    Демонстрация экрана
                                </h4>

                                {/* Локальный экран */}
                                {localScreenShare.stream && (
                                    <ScreenShareView
                                        $isFullscreen={localScreenShare.isFullscreen}
                                        $isMinimized={localScreenShare.isMinimized}
                                        $isLocal={true}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                    >
                                        <video
                                            ref={localScreenVideoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            controls={false}
                                        />
                                        <ScreenControls>
                                            <ScreenControlButton
                                                onClick={() => toggleScreenFullscreen(user?.id || '')}
                                                title={localScreenShare.isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
                                            >
                                                {localScreenShare.isFullscreen ? <FiMinimize2 size={14} /> : <FiMaximize2 size={14} />}
                                            </ScreenControlButton>
                                            <ScreenControlButton
                                                onClick={() => toggleScreenMinimize(user?.id || '')}
                                                title={localScreenShare.isMinimized ? 'Развернуть' : 'Свернуть'}
                                            >
                                                {localScreenShare.isMinimized ? <FiMaximize2 size={14} /> : <FiMinimize2 size={14} />}
                                            </ScreenControlButton>
                                            <ScreenControlButton
                                                onClick={() => closeScreenView(user?.id || '')}
                                                title="Закрыть просмотр"
                                            >
                                                <FiX size={14} />
                                            </ScreenControlButton>
                                        </ScreenControls>
                                    </ScreenShareView>
                                )}

                                {/* Удаленные экраны */}
                                {screenShareParticipants.map(participant => (
                                    <ScreenShareView
                                        key={participant.userId}
                                        $isFullscreen={participant.isFullscreen}
                                        $isMinimized={participant.isMinimized}
                                        $isLocal={false}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                    >
                                        <video
                                            ref={(el) => {
                                                if (el && participant.stream && el.srcObject !== participant.stream) {
                                                    el.srcObject = participant.stream;
                                                    el.play().catch(console.warn);
                                                }
                                            }}
                                            autoPlay
                                            playsInline
                                            muted
                                            controls={false}
                                        />
                                        <ScreenControls>
                                            <ScreenControlButton
                                                onClick={() => toggleScreenFullscreen(participant.userId)}
                                                title={participant.isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
                                            >
                                                {participant.isFullscreen ? <FiMinimize2 size={14} /> : <FiMaximize2 size={14} />}
                                            </ScreenControlButton>
                                            <ScreenControlButton
                                                onClick={() => toggleScreenMinimize(participant.userId)}
                                                title={participant.isMinimized ? 'Развернуть' : 'Свернуть'}
                                            >
                                                {participant.isMinimized ? <FiMaximize2 size={14} /> : <FiMinimize2 size={14} />}
                                            </ScreenControlButton>
                                            <ScreenControlButton
                                                onClick={() => closeScreenView(participant.userId)}
                                                title="Закрыть просмотр"
                                            >
                                                <FiX size={14} />
                                            </ScreenControlButton>
                                        </ScreenControls>
                                    </ScreenShareView>
                                ))}
                            </ScreenShareGrid>
                        )}

                        <ControlsGrid>
                            <ControlIcon
                                $active={!!localVideoStream && hasActiveConnections}
                                $warning={!hasActiveConnections}
                                onClick={toggleVideo}
                                title={!hasActiveConnections
                                    ? 'Нет соединений. Камера заблокирована'
                                    : localVideoStream ? 'Выключить камеру' : 'Включить камеру'
                                }
                                disabled={!hasActiveConnections}
                            >
                                {localVideoStream ? <FiVideo size={18} /> : <FiVideoOff size={18} />}
                            </ControlIcon>

                            <ControlIcon
                                $active={!audioCall.isMuted && hasActiveConnections}
                                $warning={!hasActiveConnections}
                                onClick={toggleMute}
                                title={!hasActiveConnections
                                    ? 'Нет соединений. Микрофон заблокирован'
                                    : audioCall.isMuted ? 'Включить микрофон' : 'Выключить микрофон'
                                }
                                disabled={!hasActiveConnections}
                            >
                                {!hasActiveConnections ? (
                                    <FiMicOff size={18} />
                                ) : audioCall.isMuted ? (
                                    <FiMicOff size={18} />
                                ) : (
                                    <FiMic size={18} />
                                )}
                            </ControlIcon>

                            <ControlIcon
                                $active={!audioCall.isSpeakerMuted}
                                onClick={toggleSpeaker}
                                title={audioCall.isSpeakerMuted ? 'Включить звук' : 'Выключить звук'}
                            >
                                {audioCall.isSpeakerMuted ? <FiVolumeX size={18} /> : <FiVolume2 size={18} />}
                            </ControlIcon>

                            <ControlIcon
                                $warning={!!screenStream}
                                onClick={toggleScreenShare}
                                title={screenStream ? 'Остановить демонстрацию' : 'Начать демонстрацию экрана'}
                            >
                                {screenStream ? <FiSquare size={18} /> : <FiMonitor size={18} />}
                            </ControlIcon>

                            <ControlIcon
                                $end
                                onClick={leaveCall}
                                title="Завершить звонок"
                            >
                                <FiPhoneOff size={18} />
                            </ControlIcon>

                            <ControlIcon
                                onClick={() => refreshCall()}
                                title="Переподключиться"
                            >
                                <FiRefreshCw size={18} />
                            </ControlIcon>
                        </ControlsGrid>
                    </CallContent>
                </>
            )}
        </CallContainer>
    );
}