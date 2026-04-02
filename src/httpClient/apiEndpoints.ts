export const ENDPOINTS = {
    // Auth
    register: { method: "POST", path: "/v1/auth/register" },
    checkUsername: { method: "POST", path: "/v1/auth/check-username-duplication" },
    getLoginChallenge: { method: "POST", path: "/v1/auth/get-login-challange" },
    login: { method: "POST", path: "/v1/auth/login" },

    // Users
    fetchByUsername: { method: "POST", path: "/v1/users/fetch-by-username" },

    // Messages
    sendMessage: { method: "POST", path: "/v1/messages/send" },
    getMessages: { method: "POST", path: "/v1/messages/conversation" },

    // Groups
    createGroup: { method: "POST", path: "/v1/groups/create" },
    getMyGroups: { method: "GET", path: "/v1/groups/my-groups" },
    getGroupMembers: { method: "POST", path: "/v1/groups/members" },
    addGroupMember: { method: "POST", path: "/v1/groups/add-member" },
    getGroupMessages: { method: "POST", path: "/v1/messages/group" },
} as const;

type EndpointKey = keyof typeof ENDPOINTS;

export const getEndpoint = (key: EndpointKey): { method: string; path: string } => {
    return ENDPOINTS[key];
};
