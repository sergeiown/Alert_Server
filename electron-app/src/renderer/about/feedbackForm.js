// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const LIMITS = { textMin: 10, textMax: 2000, maxLinks: 3 };
const PLACEHOLDER_KEYS = { idea: 'feedbackPlaceholderIdea', problem: 'feedbackPlaceholderProblem', other: 'feedbackPlaceholderOther' };
const DRAFT_KEY = 'alertServer.feedbackDraft';
const LINK_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;

function readDraft() {
    try {
        return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
    } catch (err) {
        return {};
    }
}

function writeDraft(draft) {
    try {
        if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        else localStorage.removeItem(DRAFT_KEY);
    } catch (err) {
        return;
    }
}

function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));
}

function setupFeedback(strings) {
    const el = (id) => document.getElementById(id);
    const overlay = el('feedbackOverlay');
    const form = el('feedbackForm');
    const thanks = el('feedbackThanks');
    const nameInput = el('feedbackName');
    const contactInput = el('feedbackContact');
    const textInput = el('feedbackText');
    const counter = el('feedbackCounter');
    const status = el('feedbackStatus');
    const sendButton = el('feedbackSend');
    const kindButtons = Array.from(document.querySelectorAll('#feedbackKinds [data-kind]'));
    let kind = 'idea';
    let sending = false;

    el('feedbackLinkTitle').textContent = strings.aboutFeedbackTitle;
    el('feedbackLinkHint').textContent = strings.aboutFeedbackHint;
    el('feedbackTitle').textContent = strings.feedbackTitle;
    el('kindIdea').textContent = strings.feedbackKindIdea;
    el('kindProblem').textContent = strings.feedbackKindProblem;
    el('kindOther').textContent = strings.feedbackKindOther;
    el('nameLabel').textContent = strings.feedbackNameLabel;
    el('contactLabel').textContent = strings.feedbackContactLabel;
    el('textLabel').textContent = strings.feedbackTextLabel;
    nameInput.placeholder = strings.feedbackNamePlaceholder;
    contactInput.placeholder = strings.feedbackContactPlaceholder;
    el('feedbackCancel').textContent = strings.feedbackCancel;
    el('feedbackClear').textContent = strings.feedbackClear;
    el('thanksTitle').textContent = strings.feedbackThanksTitle;
    el('thanksBody').textContent = strings.feedbackThanksBody;
    el('thanksClose').textContent = strings.feedbackClose;
    sendButton.textContent = strings.feedbackSend;

    const setKind = (value) => {
        kind = value;
        textInput.placeholder = strings[PLACEHOLDER_KEYS[value]] || strings.feedbackPlaceholderOther;
        kindButtons.forEach((button) => button.classList.toggle('active', button.dataset.kind === value));
    };

    const showStatus = (message) => {
        status.hidden = !message;
        status.textContent = message || '';
    };

    const updateCounter = () => {
        const length = textInput.value.trim().length;
        const links = (textInput.value.match(LINK_PATTERN) || []).length;
        const valid = length >= LIMITS.textMin && length <= LIMITS.textMax && links <= LIMITS.maxLinks;
        let hint = '';
        if (length < LIMITS.textMin) hint = fill(strings.feedbackHintMin, { left: LIMITS.textMin - length, min: LIMITS.textMin });
        else if (links > LIMITS.maxLinks) hint = fill(strings.feedbackHintLinks, { max: LIMITS.maxLinks });
        counter.textContent = `${hint ? hint + ' · ' : ''}${textInput.value.length} / ${LIMITS.textMax}`;
        counter.classList.toggle('ok', valid);
        counter.classList.toggle('bad', !valid);
    };

    const saveDraft = () => {
        const draft = { kind, name: nameInput.value, contact: contactInput.value, text: textInput.value };
        writeDraft(draft.text || draft.name || draft.contact ? draft : null);
    };

    const validate = () => {
        const text = textInput.value.trim();
        if (text.length < LIMITS.textMin) return fill(strings.feedbackErrTooShort, { min: LIMITS.textMin });
        if (text.length > LIMITS.textMax) return fill(strings.feedbackErrTooLong, { max: LIMITS.textMax });
        if ((text.match(LINK_PATTERN) || []).length > LIMITS.maxLinks) return fill(strings.feedbackErrLinks, { max: LIMITS.maxLinks });
        return '';
    };

    const reasonMessage = (reason) => {
        if (reason === 'rate') return strings.feedbackErrRate;
        if (reason === 'network') return strings.feedbackErrNetwork;
        if (reason === 'unavailable') return strings.feedbackErrUnavailable;
        if (reason === 'too-short') return fill(strings.feedbackErrTooShort, { min: LIMITS.textMin });
        if (reason === 'too-long') return fill(strings.feedbackErrTooLong, { max: LIMITS.textMax });
        if (reason === 'too-many-links') return fill(strings.feedbackErrLinks, { max: LIMITS.maxLinks });
        return strings.feedbackErrOther;
    };

    const close = () => {
        if (!sending) overlay.hidden = true;
    };

    const open = () => {
        const draft = readDraft();
        setKind(draft.kind || 'idea');
        nameInput.value = draft.name || '';
        contactInput.value = draft.contact || '';
        textInput.value = draft.text || '';
        updateCounter();
        showStatus('');
        form.hidden = false;
        thanks.hidden = true;
        sendButton.textContent = strings.feedbackSend;
        overlay.hidden = false;
        textInput.focus();
    };

    kindButtons.forEach((button) =>
        button.addEventListener('click', () => {
            setKind(button.dataset.kind);
            saveDraft();
        })
    );

    [nameInput, contactInput, textInput].forEach((input) =>
        input.addEventListener('input', () => {
            updateCounter();
            saveDraft();
            showStatus('');
        })
    );

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (sending) return;

        const problem = validate();
        if (problem) {
            showStatus(problem);
            return;
        }

        sending = true;
        sendButton.disabled = true;
        sendButton.textContent = strings.feedbackSending;
        showStatus('');

        let result;
        try {
            result = await window.alertServerAbout.sendFeedback({
                kind,
                name: nameInput.value,
                contact: contactInput.value,
                text: textInput.value,
            });
        } catch (err) {
            result = { ok: false, reason: 'network' };
        }

        sending = false;
        sendButton.disabled = false;

        if (result && result.ok) {
            writeDraft(null);
            form.hidden = true;
            thanks.hidden = false;
            return;
        }

        sendButton.textContent = strings.feedbackRetry;
        showStatus(reasonMessage(result && result.reason));
    });

    el('feedbackClear').addEventListener('click', () => {
        if (sending) return;
        nameInput.value = '';
        contactInput.value = '';
        textInput.value = '';
        writeDraft(null);
        updateCounter();
        showStatus('');
        sendButton.textContent = strings.feedbackSend;
        textInput.focus();
    });
    el('feedbackLink').addEventListener('click', open);
    window.alertServerAbout.onOpenFeedback(open);
    window.alertServerAbout.takeFeedbackRequest().then((requested) => {
        if (requested) open();
    });
    el('feedbackCancel').addEventListener('click', close);
    el('thanksClose').addEventListener('click', close);
    overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) close();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !overlay.hidden) close();
    });
}

export { setupFeedback };
