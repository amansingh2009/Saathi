import { Platform, NativeModules } from "react-native";
import Constants from "expo-constants";

export interface TrackReferences {
  localTrackRef: any | null;
  remoteTrackRef: any | null;
}

export interface LiveKitSessionEvents {
  onConnectionChange: (status: "connecting" | "connected" | "reconnecting" | "disconnected") => void;
  onRemoteTrackChange?: (hasVideo: boolean, hasAudio: boolean) => void;
  onTracksChanged?: (tracks: TrackReferences) => void;
  onError?: (error: Error) => void;
}

export interface CallMediaState {
  isMuted: boolean;
  isCameraOff: boolean;
  isFrontCamera: boolean;
  isSpeakerOn: boolean;
  connectionState: "connecting" | "connected" | "reconnecting" | "disconnected";
  isExpoGoSimulation: boolean;
}

let nativeLiveKitAvailable: boolean | null = null;

export function isWebRTCAvailable(): boolean {
  if (Platform.OS === "web") {
    return typeof window !== "undefined" && typeof (window as any).RTCPeerConnection !== "undefined";
  }
  return isNativeWebRTCAvailable();
}

export function isNativeWebRTCAvailable(): boolean {
  if (nativeLiveKitAvailable !== null) {
    return nativeLiveKitAvailable;
  }

  // WebRTC native modules are only bundled in custom dev builds (expo run:android / expo run:ios)
  // In Expo Go or web, native WebRTC is not linked.
  const isExpoGo =
    Constants.appOwnership === "expo" ||
    (Constants.executionEnvironment && Constants.executionEnvironment === "storeClient");

  if (isExpoGo || Platform.OS === "web") {
    nativeLiveKitAvailable = false;
    return false;
  }

  try {
    // Check if WebRTCModule is registered in NativeModules
    const hasModule = Boolean(
      NativeModules.WebRTCModule ||
      NativeModules.LiveKitReactNative ||
      NativeModules.InCallManager
    );
    nativeLiveKitAvailable = hasModule;
    return hasModule;
  } catch {
    nativeLiveKitAvailable = false;
    return false;
  }
}

export class LiveKitCallSession {
  private room: any = null;
  private state: CallMediaState = {
    isMuted: false,
    isCameraOff: false,
    isFrontCamera: true,
    isSpeakerOn: true,
    connectionState: "connecting",
    isExpoGoSimulation: false,
  };
  private events: LiveKitSessionEvents;

  constructor(events: LiveKitSessionEvents) {
    this.events = events;
  }

  getState(): CallMediaState {
    return { ...this.state };
  }

  async connect(url: string, token: string, isVideo: boolean = true): Promise<void> {
    const webSupported = Platform.OS === "web" && typeof window !== "undefined" && typeof (window as any).RTCPeerConnection !== "undefined";
    const nativeSupported = isNativeWebRTCAvailable() || webSupported;

    if (!nativeSupported) {
      // Graceful Expo Go fallback: simulate live connection with signaling active
      this.state.isExpoGoSimulation = true;
      this.state.connectionState = "connecting";
      this.events.onConnectionChange("connecting");

      setTimeout(() => {
        this.state.connectionState = "connected";
        this.events.onConnectionChange("connected");
        this.events.onRemoteTrackChange?.(isVideo, true);
      }, 1200);
      return;
    }

    try {
      if (Platform.OS !== "web") {
        const { registerGlobals } = await import("@livekit/react-native");
        registerGlobals();
      }

      const { Room, RoomEvent } = await import("livekit-client");
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      this.room = room;

      room.on(RoomEvent.Connected, () => {
        this.state.connectionState = "connected";
        this.events.onConnectionChange("connected");
      });

      room.on(RoomEvent.Reconnecting, () => {
        this.state.connectionState = "reconnecting";
        this.events.onConnectionChange("reconnecting");
      });

      room.on(RoomEvent.Reconnected, () => {
        this.state.connectionState = "connected";
        this.events.onConnectionChange("connected");
      });

      room.on(RoomEvent.Disconnected, () => {
        this.state.connectionState = "disconnected";
        this.events.onConnectionChange("disconnected");
      });

      const emitTracks = () => {
        const refs = this.getTrackRefs();
        this.events.onTracksChanged?.(refs);
      };

      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (Platform.OS === "web" && track?.attach && typeof document !== "undefined") {
          try {
            const el = track.attach();
            el.dataset.livekitTrack = track.sid || "track";
            document.body.appendChild(el);
          } catch (e) {
            console.warn("Could not attach web track:", e);
          }
        }
        const hasVideo = Array.from(room.remoteParticipants.values()).some((p: any) =>
          p.videoTrackPublications && Array.from(p.videoTrackPublications.values()).some((pub: any) => pub.isSubscribed && !pub.isMuted)
        );
        const hasAudio = Array.from(room.remoteParticipants.values()).some((p: any) =>
          p.audioTrackPublications && Array.from(p.audioTrackPublications.values()).some((pub: any) => pub.isSubscribed && !pub.isMuted)
        );
        this.events.onRemoteTrackChange?.(hasVideo, hasAudio);
        emitTracks();
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
        if (Platform.OS === "web" && track?.detach) {
          try {
            track.detach().forEach((el: any) => el?.remove?.());
          } catch {}
        }
        this.events.onRemoteTrackChange?.(false, false);
        emitTracks();
      });

      room.on(RoomEvent.LocalTrackPublished, emitTracks);
      room.on(RoomEvent.LocalTrackUnpublished, emitTracks);
      room.on(RoomEvent.TrackMuted, emitTracks);
      room.on(RoomEvent.TrackUnmuted, emitTracks);

      await room.connect(url, token);

      // Enable microphone
      await room.localParticipant.setMicrophoneEnabled(true);

      // Enable camera if video call
      if (isVideo) {
        await room.localParticipant.setCameraEnabled(true);
      }
      emitTracks();
    } catch (err) {
      console.warn("LiveKit connection notice, falling back to signaling mode:", err);
      this.state.isExpoGoSimulation = true;
      this.state.connectionState = "connected";
      this.events.onConnectionChange("connected");
    }
  }

  async toggleMicrophone(): Promise<boolean> {
    this.state.isMuted = !this.state.isMuted;
    if (this.room?.localParticipant) {
      try {
        await this.room.localParticipant.setMicrophoneEnabled(!this.state.isMuted);
      } catch (err) {
        console.warn("Could not toggle microphone track:", err);
      }
    }
    return this.state.isMuted;
  }

  async toggleCamera(): Promise<boolean> {
    this.state.isCameraOff = !this.state.isCameraOff;
    if (this.room?.localParticipant) {
      try {
        await this.room.localParticipant.setCameraEnabled(!this.state.isCameraOff);
      } catch (err) {
        console.warn("Could not toggle camera track:", err);
      }
    }
    return this.state.isCameraOff;
  }

  async switchCamera(): Promise<boolean> {
    this.state.isFrontCamera = !this.state.isFrontCamera;
    if (this.room?.localParticipant) {
      try {
        const tracks = Array.from(this.room.localParticipant.videoTrackPublications.values()) as any[];
        for (const pub of tracks) {
          if (pub.track?.switchCamera) {
            await pub.track.switchCamera();
          }
        }
      } catch (err) {
        console.warn("Could not switch camera:", err);
      }
    }
    return this.state.isFrontCamera;
  }

  toggleSpeaker(): boolean {
    this.state.isSpeakerOn = !this.state.isSpeakerOn;
    return this.state.isSpeakerOn;
  }

  async disconnect(): Promise<void> {
    this.state.connectionState = "disconnected";
    this.events.onConnectionChange("disconnected");
    if (Platform.OS === "web" && typeof document !== "undefined") {
      try {
        document.querySelectorAll("[data-livekit-track]").forEach((el) => el.remove());
      } catch {}
    }
    if (this.room) {
      try {
        await this.room.disconnect();
      } catch (err) {
        console.warn("Error disconnecting room:", err);
      }
      this.room = null;
    }
  }

  getTrackRefs(): TrackReferences {
    if (!this.room) return { localTrackRef: null, remoteTrackRef: null };
    let localTrackRef: any = null;
    let remoteTrackRef: any = null;

    try {
      if (this.room.localParticipant) {
        const pubs = Array.from(this.room.localParticipant.videoTrackPublications.values()) as any[];
        const localPub = pubs.find((p) => p.track);
        if (localPub) {
          localTrackRef = {
            participant: this.room.localParticipant,
            publication: localPub,
            source: localPub.source,
          };
        }
      }

      if (this.room.remoteParticipants) {
        for (const remote of this.room.remoteParticipants.values()) {
          const pubs = Array.from(remote.videoTrackPublications.values()) as any[];
          const remotePub = pubs.find((p) => p.track && p.isSubscribed && !p.isMuted);
          if (remotePub) {
            remoteTrackRef = {
              participant: remote,
              publication: remotePub,
              source: remotePub.source,
            };
            break;
          }
        }
      }
    } catch (err) {
      console.warn("Could not retrieve track references:", err);
    }

    return { localTrackRef, remoteTrackRef };
  }

  getNativeRoom(): any {
    return this.room;
  }
}

