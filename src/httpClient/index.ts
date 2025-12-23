import * as endpoints from "./apiEndpoints.ts"
import httpClient from "./httpClient.ts";


const sendRequest = async (headers, data, url) =>{
    let client = httpClient()
}


export const sendRegisterCall = async (username, passphrase) => {
    let resp = await httpClient(endpoints.getEndpoint("register"))
    resp.data

}