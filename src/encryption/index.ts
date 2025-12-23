import {ed25519} from '@noble/curves/ed25519.js';
import {bytesToBase64} from "../utils/utils.ts";

export const generateCipheraKeys = () :{publicKey: string, privateKey: string} => {
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(privateKey);

    return {
        publicKey: bytesToBase64(publicKey),
        privateKey: bytesToBase64(privateKey),
    };
};

export const deriveKeyFromPassphrase = async (
    passphrase: string,
    salt: BufferSource,
    iterations: number = 310_000
) => {
    const encoder = new TextEncoder();

    const baseKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(passphrase),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations,
            hash: "SHA-256",
        },
        baseKey,
        {
            name: "AES-GCM",
            length: 256,
        },
        false,
        ["encrypt", "decrypt"]
    );
}


export const aesGcmEncrypt = async (
    key: CryptoKey,
    plaintext: BufferSource,
    iv: BufferSource
): Promise<Uint8Array> => {
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        plaintext
    )
    return new Uint8Array(encrypted)
}




