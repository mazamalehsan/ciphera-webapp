import {Link} from "react-router-dom";

export default function Landing() {

    return (<>
        <img width={500} height={400} src="/logo.png" alt={"Logo"}></img><br></br>
        <h1>Ciphera Chat</h1><br/>
        <p>You messages are 100% encrypted. Your private key and passphrase never leave your machine.</p><br></br>
        <Link to={"/login"}><button>Login</button></Link>&nbsp;<Link to="/register"><button>Register</button></Link>
    </>)
}