// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const players = new Map();

window.alertServerSound.onPlay(({ id, url, volume }) => {
    const audio = new Audio(url);
    audio.volume = volume;
    players.set(id, audio);
    const finish = (error) => {
        if (!players.delete(id)) return;
        window.alertServerSound.ended(id, error);
    };
    audio.addEventListener('ended', () => finish(null));
    audio.addEventListener('error', () => finish('audio error'));
    audio.play().catch((err) => finish(err.message));
});

window.alertServerSound.onStop((id) => {
    const audio = players.get(id);
    if (!audio) return;
    players.delete(id);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
});
