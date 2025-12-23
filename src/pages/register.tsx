import {useState} from "react";
import _ from "lodash"
import {toast, ToastContainer} from "react-toastify";

const TOAST_CONTAINER_ID = "toast"


export default function Register() {

    const [username, setUsername] = useState("")
    const [plainPassphrase, setPlainPassphrase] = useState("")

    const performUsernameAndPassphraseValidation = (username: string, plainPassphrase: string): {
        msg: string,
        error: boolean
    } => {
        if (_.isEmpty(username)) {
            return {msg: "Username is empty.", error: true}
        }

        if (username.length < 4) {
            return {msg: "Username must be at least 4 characters long.", error: true}
        }

        if (_.isEmpty(plainPassphrase)) {
            return {msg: "Passphrase is empty.", error: true}
        }

        if (plainPassphrase.length < 8) {
            return {msg: "Passphrase must be at least 8 characters long.", error: true}
        }
        return {error: false, msg: ""}
    }

    const register = async (): Promise<void> => {

        const {msg, error} = performUsernameAndPassphraseValidation(username, plainPassphrase)
        if (error) {
            toast.error(msg, {containerId: TOAST_CONTAINER_ID})
            return
        }


        console.log(username)
        console.log(plainPassphrase)
    }

    return (<>
        <h1>Register</h1><br/>
        <input placeholder="Username" type="text" onChange={(e) => setUsername(e.target.value)}></input><br/><br/>
        <input placeholder="Passphrase for your key." type="text"
               onChange={(e) => setPlainPassphrase(e.target.value)}></input><br/><br/>
        <button onClick={register}>Register</button>
        <ToastContainer containerId={TOAST_CONTAINER_ID}/>
    </>)
}