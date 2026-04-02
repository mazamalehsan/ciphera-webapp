import { useState } from "react";
import _ from "lodash";
import { toast, ToastContainer } from "react-toastify";
import { aesGcmEncrypt, deriveKeyFromPassphrase, generateCipheraKeys } from "../encryption";
import { PASSPHRASE_ITERATIONS } from "../constants";
import { base64ToUint8Array, downloadFile, uint8ArrayToBase64 } from "../utils/utils.ts";
import { checkUsernameDuplication, registerUser } from "../httpClient";
import { useNavigate } from "react-router-dom";
import * as CBOR from "cbor-web";

const TOAST_CONTAINER_ID = "toast";

export default function Register() {
    const [username, setUsername] = useState("");
    const [plainPassphrase, setPlainPassphrase] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const performUsernameAndPassphraseValidation = (
        username: string,
        plainPassphrase: string
    ): { msg: string; error: boolean } => {
        if (_.isEmpty(username)) {
            return { msg: "Username is empty.", error: true };
        }
        if (username.length < 4) {
            return { msg: "Username must be at least 4 characters long.", error: true };
        }
        if (_.isEmpty(plainPassphrase)) {
            return { msg: "Passphrase is empty.", error: true };
        }
        if (plainPassphrase.length < 8) {
            return { msg: "Passphrase must be at least 8 characters long.", error: true };
        }
        return { error: false, msg: "" };
    };

    const register = async (): Promise<void> => {
        const { msg, error } = performUsernameAndPassphraseValidation(username, plainPassphrase);
        if (error) {
            toast.error(msg, { containerId: TOAST_CONTAINER_ID });
            return;
        }

        setLoading(true);

        try {
            const { isUsernameTaken } = await checkUsernameDuplication(username);
            if (isUsernameTaken) {
                toast.error("Username already taken.", { containerId: TOAST_CONTAINER_ID });
                return;
            }

            const { privateKey, publicKey, encryptionKey } = generateCipheraKeys();

            // Encrypt private key with passphrase
            const salt = crypto.getRandomValues(new Uint8Array(32));
            const encryptionKey = await deriveKeyFromPassphrase(plainPassphrase, salt, PASSPHRASE_ITERATIONS);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const privateKeyBytes = base64ToUint8Array(privateKey);
            const encryptedPrivateKey = await aesGcmEncrypt(encryptionKey, privateKeyBytes, iv);

            // Register on server (public keys sent, never the private key)
            await registerUser(username, publicKey, encryptionKey);

            // Download encrypted private key file
            const privateKeyBinaryFile = CBOR.encode({
                s: uint8ArrayToBase64(salt),
                i: PASSPHRASE_ITERATIONS,
                pk: uint8ArrayToBase64(encryptedPrivateKey),
                iv: uint8ArrayToBase64(iv),
                un: username,
            });

            downloadFile(privateKeyBinaryFile, `${username}.ciphera`, "application/octet-stream");

            toast.success("Registered! Key file downloaded. Keep it safe.", { containerId: TOAST_CONTAINER_ID });

            setTimeout(() => navigate("/login"), 2000);
        } catch (err: any) {
            toast.error(err?.message || "Registration failed.", { containerId: TOAST_CONTAINER_ID });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <h1>Register</h1>
            <br />
            <input
                placeholder="Username"
                type="text"
                onChange={(e) => setUsername(e.target.value)}
            />
            <br /><br />
            <input
                placeholder="Passphrase for your key"
                type="password"
                onChange={(e) => setPlainPassphrase(e.target.value)}
            />
            <br /><br />
            <button onClick={register} disabled={loading}>
                {loading ? "Registering..." : "Register"}
            </button>
            <ToastContainer containerId={TOAST_CONTAINER_ID} />
        </>
    );
}
