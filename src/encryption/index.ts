import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { bytesToBase64, base64ToUint8Array } from "../utils/utils.ts";

// ── Key Generation ──
// One 32-byte secret key serves both:
//   - Ed25519 (signing/auth)
//   - X25519  (ECDH encryption)

export const generateCipheraKeys = (): {
    publicKey: string;      // Ed25519 public key (base64) — for auth signature verification
    encryptionKey: string;  // X25519 public key (base64) — for ECDH encryption
    privateKey: string;     // 32-byte secret (base64) — used for both
} => {
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(privateKey);
    const encryptionKey = x25519.getPublicKey(privateKey);

    return {
        publicKey: bytesToBase64(publicKey),
        encryptionKey: bytesToBase64(encryptionKey),
        privateKey: bytesToBase64(privateKey),
    };
};

// ── Ed25519 Signing ──

export const signMessage = (privateKeyBase64: string, messageBase64: string): string => {
    const privateKey = base64ToUint8Array(privateKeyBase64);
    const message = base64ToUint8Array(messageBase64);
    const signature = ed25519.sign(message, privateKey);
    return bytesToBase64(signature);
};

// ── X25519 ECDH Shared Secret ──

export const deriveSharedSecret = (myPrivKeyBase64: string, theirX25519PubBase64: string): Uint8Array => {
    const myPriv = base64ToUint8Array(myPrivKeyBase64);
    const theirPub = base64ToUint8Array(theirX25519PubBase64);
    return x25519.getSharedSecret(myPriv, theirPub);
};

// ── AES-256-GCM Key from Shared Secret ──

const deriveAesKeyFromSharedSecret = async (sharedSecret: Uint8Array): Promise<CryptoKey> => {
    const rawKey = await crypto.subtle.importKey(
        "raw",
        sharedSecret,
        "HKDF",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(32),
            info: new TextEncoder().encode("ciphera-e2e"),
        },
        rawKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
};

// ── PBKDF2 Key from Passphrase ──

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
};

// ── AES-GCM Encrypt / Decrypt ──

export const aesGcmEncrypt = async (
    key: CryptoKey,
    plaintext: BufferSource,
    iv: BufferSource
): Promise<Uint8Array> => {
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        plaintext
    );
    return new Uint8Array(encrypted);
};

export const aesGcmDecrypt = async (
    key: CryptoKey,
    ciphertext: BufferSource,
    iv: BufferSource
): Promise<Uint8Array> => {
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
    );
    return new Uint8Array(decrypted);
};

// ── DM Message Encryption ──
// ECDH(sender privKey, recipient X25519 pub) → shared secret → AES-256-GCM

export const encryptDirectMessage = async (
    plaintext: string,
    senderPrivKeyBase64: string,
    recipientEncKeyBase64: string  // X25519 public key
): Promise<{ ciphertext: string; iv: string }> => {
    const sharedSecret = deriveSharedSecret(senderPrivKeyBase64, recipientEncKeyBase64);
    const aesKey = await deriveAesKeyFromSharedSecret(sharedSecret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const encrypted = await aesGcmEncrypt(aesKey, encoded, iv);

    return {
        ciphertext: bytesToBase64(encrypted),
        iv: bytesToBase64(iv),
    };
};

export const decryptDirectMessage = async (
    ciphertextBase64: string,
    ivBase64: string,
    myPrivKeyBase64: string,
    senderEncKeyBase64: string  // sender's X25519 public key
): Promise<string> => {
    const sharedSecret = deriveSharedSecret(myPrivKeyBase64, senderEncKeyBase64);
    const aesKey = await deriveAesKeyFromSharedSecret(sharedSecret);
    const ciphertext = base64ToUint8Array(ciphertextBase64);
    const iv = base64ToUint8Array(ivBase64);
    const decrypted = await aesGcmDecrypt(aesKey, ciphertext, iv);

    return new TextDecoder().decode(decrypted);
};

// ── Group Message Encryption ──
// Random AES key per message, encrypted per-member via ECDH

export interface EncryptedGroupKey {
    userId: string;
    encryptedKey: string;
    keyIv: string;
}

export const encryptGroupMessage = async (
    plaintext: string,
    senderPrivKeyBase64: string,
    members: { userId: string; encryptionKey: string }[]  // X25519 public keys
): Promise<{ ciphertext: string; iv: string; keys: EncryptedGroupKey[] }> => {
    const messageKey = crypto.getRandomValues(new Uint8Array(32));
    const aesKey = await crypto.subtle.importKey(
        "raw",
        messageKey,
        { name: "AES-GCM" },
        true,
        ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const encrypted = await aesGcmEncrypt(aesKey, encoded, iv);

    const keys: EncryptedGroupKey[] = [];
    for (const member of members) {
        const sharedSecret = deriveSharedSecret(senderPrivKeyBase64, member.encryptionKey);
        const wrapKey = await deriveAesKeyFromSharedSecret(sharedSecret);
        const keyIv = crypto.getRandomValues(new Uint8Array(12));
        const encryptedKey = await aesGcmEncrypt(wrapKey, messageKey, keyIv);

        keys.push({
            userId: member.userId,
            encryptedKey: bytesToBase64(encryptedKey),
            keyIv: bytesToBase64(keyIv),
        });
    }

    return {
        ciphertext: bytesToBase64(encrypted),
        iv: bytesToBase64(iv),
        keys,
    };
};

export const decryptGroupMessage = async (
    ciphertextBase64: string,
    ivBase64: string,
    myUserId: string,
    myPrivKeyBase64: string,
    senderEncKeyBase64: string,  // sender's X25519 public key
    keys: EncryptedGroupKey[]
): Promise<string> => {
    const myKey = keys.find(k => k.userId === myUserId);
    if (!myKey) throw new Error("No encrypted key found for this user");

    const sharedSecret = deriveSharedSecret(myPrivKeyBase64, senderEncKeyBase64);
    const unwrapKey = await deriveAesKeyFromSharedSecret(sharedSecret);
    const messageKeyBytes = await aesGcmDecrypt(
        unwrapKey,
        base64ToUint8Array(myKey.encryptedKey),
        base64ToUint8Array(myKey.keyIv)
    );

    const messageAesKey = await crypto.subtle.importKey(
        "raw",
        messageKeyBytes,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );

    const decrypted = await aesGcmDecrypt(
        messageAesKey,
        base64ToUint8Array(ciphertextBase64),
        base64ToUint8Array(ivBase64)
    );

    return new TextDecoder().decode(decrypted);
};

// ── Private Key File Decrypt ──

export const decryptPrivateKeyFromFile = async (
    encryptedPrivKeyBase64: string,
    ivBase64: string,
    saltBase64: string,
    iterations: number,
    passphrase: string
): Promise<string> => {
    const salt = base64ToUint8Array(saltBase64);
    const iv = base64ToUint8Array(ivBase64);
    const encryptedPrivKey = base64ToUint8Array(encryptedPrivKeyBase64);

    const aesKey = await deriveKeyFromPassphrase(passphrase, salt, iterations);
    const decrypted = await aesGcmDecrypt(aesKey, encryptedPrivKey, iv);

    return bytesToBase64(decrypted);
};
