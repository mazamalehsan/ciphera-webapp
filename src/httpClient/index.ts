import httpClient from "./httpClient.ts";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export const sendRequest = async <TResponse = any>(
    token: string | null,
    url: string,
    method: HttpMethod,
    payload?: unknown,
): Promise<TResponse> => {
    const config = token ? { authToken: token } : {};

    let resp;
    if (method === "get" || method === "delete") {
        resp = await httpClient[method](url, config);
    } else {
        resp = await httpClient[method](url, payload, config);
    }

    return resp.data?.content;
};

// ── Auth API ──

export const checkUsernameDuplication = async (username: string): Promise<{ isUsernameTaken: boolean }> => {
    return sendRequest(null, "/v1/auth/check-username-duplication", "post", { Username: username });
};

export const registerUser = async (username: string, publicKey: string, encryptionKey: string): Promise<void> => {
    return sendRequest(null, "/v1/auth/register", "post", {
        Username: username,
        PublicKey: publicKey,
        EncryptionKey: encryptionKey,
    });
};

export const getLoginChallenge = async (username: string): Promise<{ challenge: string; loginId: string }> => {
    return sendRequest(null, "/v1/auth/get-login-challange", "post", { Username: username });
};

export const loginWithSignedChallenge = async (
    username: string,
    signedChallenge: string,
    loginId: string
): Promise<{ token: string }> => {
    return sendRequest(null, "/v1/auth/login", "post", {
        Username: username,
        SignedChallenge: signedChallenge,
        LoginId: loginId,
    });
};

// ── User API ──

export const fetchUserByUsername = async (token: string, username: string) => {
    return sendRequest(token, "/v1/users/fetch-by-username", "post", { Username: username });
};

// ── Message API ──

export const sendMessageApi = async (token: string, message: {
    To: string;
    Content: string;
    IV: string;
    GroupId?: string;
    Keys?: { UserId: string; EncryptedKey: string; KeyIV: string }[];
}) => {
    return sendRequest(token, "/v1/messages/send", "post", message);
};

export const getConversationMessages = async (token: string, otherUserId: string) => {
    return sendRequest(token, "/v1/messages/conversation", "post", { OtherUserId: otherUserId });
};

export const getGroupMessages = async (token: string, groupId: string) => {
    return sendRequest(token, "/v1/messages/group", "post", { GroupId: groupId });
};

// ── Group API ──

export const createGroup = async (token: string, name: string, members: string[]) => {
    return sendRequest(token, "/v1/groups/create", "post", { Name: name, Members: members });
};

export const getMyGroups = async (token: string) => {
    return sendRequest(token, "/v1/groups/my-groups", "get");
};

export const getGroupMembers = async (token: string, groupId: string) => {
    return sendRequest(token, "/v1/groups/members", "post", { GroupId: groupId });
};

export const addGroupMember = async (token: string, groupId: string, username: string) => {
    return sendRequest(token, "/v1/groups/add-member", "post", { GroupId: groupId, Username: username });
};
