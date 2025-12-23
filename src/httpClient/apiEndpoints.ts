export const ENDPOINTS = {
    register: {
        method: "POST",
        path: "/v1/auth/register"
    }
}

type endpointKey = keyof typeof ENDPOINTS

export const getEndpoint = (key: endpointKey) :{method: string, path: string} => {
    return ENDPOINTS[key]
}





