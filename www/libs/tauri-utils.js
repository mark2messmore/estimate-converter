// shim for Tauri v2 plugins using global object
// This avoids network imports which fail in WebView

const getTauri = () => window.__TAURI__;

export const updater = {
    check: async () => {
        const tauri = getTauri();
        if (!tauri?.core?.invoke) {
            console.warn("Tauri API not found");
            return null;
        }

        console.log("Checking for updates via invoke...");
        try {
            // 'plugin:updater|check' returns the update metadata + rid
            const result = await tauri.core.invoke('plugin:updater|check');
            
            console.log("Update check raw result:", result);

            if (!result || !result.available) {
                return { available: false };
            }

            return {
                available: true,
                version: result.version,
                body: result.body,
                date: result.date,
                downloadAndInstall: async () => {
                    console.log("Downloading update...");
                    // We need to handle the progress channel to satisfy the command signature
                    const channel = new tauri.core.Channel();
                    
                    channel.onmessage = (msg) => {
                        console.log("Update progress:", msg);
                    };

                    return tauri.core.invoke('plugin:updater|download_and_install', {
                        rid: result.rid,
                        onEvent: channel
                    });
                }
            };
        } catch (e) {
            console.error("Update check failed:", e);
            throw e;
        }
    }
};

export const dialog = {
    ask: async (message, options) => {
        const tauri = getTauri();
        if (!tauri?.core?.invoke) return confirm(message);
        
        return tauri.core.invoke('plugin:dialog|ask', {
            message: message.toString(),
            title: options?.title,
            kind: options?.kind,
            okLabel: options?.okLabel,
            cancelLabel: options?.cancelLabel
        });
    },
    message: async (text, options) => {
        const tauri = getTauri();
        if (!tauri?.core?.invoke) return alert(text);
        
        return tauri.core.invoke('plugin:dialog|message', {
            message: text.toString(),
            title: options?.title,
            kind: options?.kind
        });
    },
    save: async (options) => {
        const tauri = getTauri();
        if (!tauri?.core?.invoke) return null;
        return tauri.core.invoke('plugin:dialog|save', {
            defaultPath: options?.defaultPath,
            filters: options?.filters,
            title: options?.title
        });
    }
};

export const fs = {
    writeTextFile: async (path, contents) => {
        const tauri = getTauri();
        if (!tauri?.core?.invoke) throw new Error("Tauri API not found");
        return tauri.core.invoke('plugin:fs|write_text_file', {
            path,
            contents
        });
    }
};

export const process = {
    relaunch: async () => {
        const tauri = getTauri();
        if (!tauri?.core?.invoke) return location.reload();
        
        return tauri.core.invoke('plugin:process|relaunch');
    }
};
