/* Copyright (c) 2024 Serhii I. Myshko https://github.com/sergeiown/Leaflet_FullScreen_Button/blob/main/LICENSE */

L.Control.FullScreenButton = L.Control.extend({
    options: {
        position: 'topleft',
        title: 'Toggle fullscreen',
        enterFullScreenIcon: null,
        exitFullScreenIcon: null,
        enterFullScreenTitle: 'Enter fullscreen mode',
        exitFullScreenTitle: 'Exit fullscreen mode',
        onFullScreenChange: null,
        showNotification: true,
    },

    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-control-fullscreen leaflet-bar leaflet-control');
        container.title = this.options.title;

        this._updateIcon(container, false);

        container.onclick = () => {
            this.toggleFullScreen(map);
        };

        this._eventHandlers = {
            fullscreenchange: this._throttle(() => this._handleFullScreenChange(container, map), 100),
            keydown: this._preventF11Default.bind(this),
        };

        this._addEventListeners();

        return container;
    },

    onRemove: function () {
        this._removeEventListeners();
    },

    toggleFullScreen: async function (map) {
        const mapContainer = map.getContainer();
        const isFullScreen = this._isFullScreen(mapContainer);

        try {
            await this._toggleFullScreenElement(mapContainer, !isFullScreen);
            this._updateIcon(this._container, !isFullScreen);
            this._handleFullScreenChange(mapContainer, map);
        } catch (err) {
            console.error(`Error switching to full-screen mode: ${err.message} (${err.name})`);
            if (this.options.showNotification) {
                this._showNotification(`Error switching to full-screen mode`, mapContainer);
            }
        }
    },

    _toggleFullScreenElement: async function (element, enterFullScreen = true) {
        const methods = {
            enter: ['requestFullscreen', 'mozRequestFullScreen', 'webkitRequestFullscreen', 'msRequestFullscreen'],
            exit: ['exitFullscreen', 'mozCancelFullScreen', 'webkitExitFullscreen', 'msExitFullscreen'],
        };

        const target = enterFullScreen ? element : document;

        for (const method of methods[enterFullScreen ? 'enter' : 'exit']) {
            if (target[method]) {
                await target[method]();
                return;
            }
        }

        element.classList.toggle('pseudo-fullscreen', enterFullScreen);

        map.invalidateSize();
    },

    _handleFullScreenChange: function (container, map) {
        const isFullScreen = this._isFullScreen(container);
        this._updateIcon(container, isFullScreen);
        this._container.title = isFullScreen ? this.options.exitFullScreenTitle : this.options.enterFullScreenTitle;

        if (typeof this.options.onFullScreenChange === 'function') {
            if (this._isHandlingFullScreenChange) return;
            this._isHandlingFullScreenChange = true;

            requestAnimationFrame(() => {
                this.options.onFullScreenChange(isFullScreen);
                this._isHandlingFullScreenChange = false;
            });
        }

        if (this.options.showNotification) {
            this._showNotification(
                isFullScreen ? 'Full-screen mode is ON' : 'Full-screen mode is OFF',
                map.getContainer()
            );
        }
    },

    _preventF11Default: function (event) {
        if (event.key === 'F11') {
            event.preventDefault();
            this.toggleFullScreen(map);
        }
    },

    _updateIcon: function (container, isFullScreen) {
        const enterFullScreenIconDefault = `
            <svg width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 6a1 1 0 011-1h2a1 1 0 000-2H6a3 3 0 00-3 3v2a1 1 0 002 0V6zM5 18a1 1 0 001 1h2a1 1 0 110 2H6a3 3 0 01-3-3v-2a1 1 0 112 0v2zM18 5a1 1 0 011 1v2a1 1 0 102 0V6a3 3 0 00-3-3h-2a1 1 0 100 2h2zM19 18a1 1 0 01-1 1h-2a1 1 0 100 2h2a3 3 0 003-3v-2a1 1 0 10-2 0v2z" fill="#000"/></svg>
        `;

        const exitFullScreenIconDefault = `
            <svg width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4a1 1 0 00-2 0v2.5a.5.5 0 01-.5.5H4a1 1 0 000 2h2.5A2.5 2.5 0 009 6.5V4zM9 20a1 1 0 11-2 0v-2.5a.5.5 0 00-.5-.5H4a1 1 0 110-2h2.5A2.5 2.5 0 019 17.5V20zM16 3a1 1 0 00-1 1v2.5A2.5 2.5 0 0017.5 9H20a1 1 0 100-2h-2.5a.5.5 0 01-.5-.5V4a1 1 0 00-1-1zM15 20a1 1 0 102 0v-2.5a.5.5 0 01.5-.5H20a1 1 0 100-2h-2.5a2.5 2.5 0 00-2.5 2.5V20z" fill="#000"/></svg>

        `;

        const iconUrl = isFullScreen
            ? this.options.exitFullScreenIcon || `data:image/svg+xml;base64,${btoa(exitFullScreenIconDefault)}`
            : this.options.enterFullScreenIcon || `data:image/svg+xml;base64,${btoa(enterFullScreenIconDefault)}`;

        if (container.classList.contains('leaflet-control-fullscreen')) {
            container.style.backgroundImage = `url('${iconUrl}')`;
        }
    },

    _addEventListeners: function () {
        document.addEventListener('fullscreenchange', this._eventHandlers.fullscreenchange);
        document.addEventListener('mozfullscreenchange', this._eventHandlers.fullscreenchange);
        document.addEventListener('webkitfullscreenchange', this._eventHandlers.fullscreenchange);
        document.addEventListener('MSFullscreenChange', this._eventHandlers.fullscreenchange);
        document.addEventListener('keydown', this._eventHandlers.keydown);
    },

    _removeEventListeners: function () {
        if (this._eventHandlers) {
            document.removeEventListener('fullscreenchange', this._eventHandlers.fullscreenchange);
            document.removeEventListener('mozfullscreenchange', this._eventHandlers.fullscreenchange);
            document.removeEventListener('webkitfullscreenchange', this._eventHandlers.fullscreenchange);
            document.removeEventListener('MSFullscreenChange', this._eventHandlers.fullscreenchange);
            document.removeEventListener('keydown', this._eventHandlers.keydown);
            delete this._eventHandlers;
        }
    },

    _throttle: function (func, limit) {
        let inThrottle;
        return function () {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    },

    _isFullScreen: function (element) {
        return (
            document.fullscreenElement ||
            document.mozFullScreenElement ||
            document.webkitFullscreenElement ||
            document.msFullscreenElement ||
            element.classList.contains('pseudo-fullscreen')
        );
    },

    _showNotification: function (message, mapContainer) {
        if (this._notificationElement) {
            mapContainer.removeChild(this._notificationElement);
            this._notificationElement = null;
            clearTimeout(this._notificationTimeout);
        }

        const notification = L.DomUtil.create('div', '', mapContainer);
        notification.id = 'map-notification';
        notification.innerText = message;
        mapContainer.appendChild(notification);

        this._notificationElement = notification;

        this._notificationTimeout = setTimeout(() => {
            notification.style.transition = 'opacity 1s';
            notification.style.opacity = '0';

            setTimeout(() => {
                if (notification.parentElement) {
                    mapContainer.removeChild(notification);
                }
                this._notificationElement = null;
            }, 1000);
        }, 3000);
    },
});

L.control.fullScreenButton = function (options) {
    return new L.Control.FullScreenButton(options);
};

const style = document.createElement('style');
style.innerHTML = `
    .pseudo-fullscreen {
        background-color: #ffffff;
        top: 0;
        left: 0;
        position: fixed !important;
        width: 100% !important;
        height: 100% !important;
        z-index: 9999 !important;
    }

    .leaflet-control-fullscreen {
        background-color: #ffffff;
        background-size: 24px 24px;
        background-repeat: no-repeat;
        background-position: center;
        width: 30px;
        height: 30px;
        cursor: pointer;
        z-index: 9999;
    }

    .leaflet-control-fullscreen:hover {
        background-color: #F4F4F4;
    }

    #map-notification {
        position: absolute;
        left: 50%;
        bottom: 20px;
        transform: translateX(-50%);
        padding: 10px 20px;
        background-color: #00000099;
        color: #ffffff;
        font-size: 1rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        border-radius: 5px;
        z-index: 9999;
    }
`;
document.head.appendChild(style);
