import {Link} from "react-router-dom";

export default function Header() {
    return (<div style={{width: "100vh", height:"10vh"}}>
        <Link to={"/"}>
        <img style={{float:"left"}} width={150} height={100} alt={"Logo"} src="/logo.png"></img>
        </Link>
    </div>)
}