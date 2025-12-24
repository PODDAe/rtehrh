/**
 * Background Music Player for DARK NOVA XMD
 * Auto-plays background music without visible controls
 */

class BackgroundMusicPlayer {
    constructor() {
        this.audio = document.getElementById('bgMusic');
        this.indicator = document.getElementById('musicIndicator');
        this.isPlaying = false;
        this.userInteracted = false;
        this.volume = 0.3; // 30% volume
        
        if (!this.audio) {
            console.error('Music player: Audio element not found');
            return;
        }
        
        this.init();
    }
    
    init() {
        // Set initial volume
        this.audio.volume = this.volume;
        
        // Try to restore previous state
        this.restoreState();
        
        // Setup event listeners for user interaction
        this.setupInteractionListeners();
        
        // Try to play immediately (will likely be blocked by browser)
        setTimeout(() => this.attemptPlay(), 1000);
        
        // Setup audio event listeners
        this.setupAudioListeners();
        
        console.log('🎵 Background music player initialized');
    }
    
    setupInteractionListeners() {
        const interactionEvents = ['click', 'touchstart', 'keydown', 'mousedown', 'scroll'];
        
        const handleInteraction = () => {
            if (!this.userInteracted) {
                this.userInteracted = true;
                this.attemptPlay();
                
                // Remove listeners after first interaction
                interactionEvents.forEach(event => {
                    document.removeEventListener(event, handleInteraction);
                });
            }
        };
        
        interactionEvents.forEach(event => {
            document.addEventListener(event, handleInteraction, { once: false });
        });
    }
    
    setupAudioListeners() {
        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            this.showIndicator();
            this.saveState();
        });
        
        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.hideIndicator();
            this.saveState();
        });
        
        this.audio.addEventListener('timeupdate', () => {
            this.saveState();
        });
        
        this.audio.addEventListener('ended', () => {
            // Loop is handled by the loop attribute
            this.audio.currentTime = 0;
            this.audio.play().catch(() => {});
        });
    }
    
    attemptPlay() {
        if (!this.audio || this.isPlaying) return;
        
        const playPromise = this.audio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    this.isPlaying = true;
                    this.showIndicator();
                    console.log('🎵 Background music started');
                })
                .catch(error => {
                    if (error.name === 'NotAllowedError') {
                        // Autoplay policy blocked playback
                        console.log('🎵 Music play blocked, waiting for user interaction');
                    } else {
                        console.error('🎵 Music play error:', error);
                    }
                });
        }
    }
    
    showIndicator() {
        if (this.indicator) {
            this.indicator.style.display = 'flex';
            // Auto-hide after 5 seconds
            setTimeout(() => {
                if (this.indicator) {
                    this.indicator.style.opacity = '0.5';
                }
            }, 5000);
        }
    }
    
    hideIndicator() {
        if (this.indicator) {
            this.indicator.style.display = 'none';
        }
    }
    
    saveState() {
        try {
            const state = {
                currentTime: this.audio.currentTime,
                volume: this.volume,
                playing: this.isPlaying,
                timestamp: Date.now()
            };
            localStorage.setItem('darkNovaMusicState', JSON.stringify(state));
        } catch (error) {
            console.error('Failed to save music state:', error);
        }
    }
    
    restoreState() {
        try {
            const saved = localStorage.getItem('darkNovaMusicState');
            if (saved) {
                const state = JSON.parse(saved);
                
                // Restore if within 2 hours
                if (Date.now() - state.timestamp < 7200000) {
                    this.audio.currentTime = state.currentTime || 0;
                    this.volume = state.volume || 0.3;
                    this.audio.volume = this.volume;
                    
                    // Auto-play if it was playing
                    if (state.playing) {
                        setTimeout(() => this.attemptPlay(), 500);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to restore music state:', error);
        }
    }
    
    // Public methods
    play() {
        this.userInteracted = true;
        this.attemptPlay();
    }
    
    pause() {
        if (this.audio) {
            this.audio.pause();
            this.isPlaying = false;
        }
    }
    
    setVolume(level) {
        this.volume = Math.max(0, Math.min(1, level));
        if (this.audio) {
            this.audio.volume = this.volume;
        }
        this.saveState();
    }
}

// Initialize music player when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure everything is loaded
    setTimeout(() => {
        window.darkNovaMusic = new BackgroundMusicPlayer();
    }, 500);
});
