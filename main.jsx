import {createRoot} from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import Cliente from './Cliente';import Repartidor from './Repartidor';import Admin from './Admin';
const h=location.hash;
createRoot(document.getElementById('root')).render(
 h.startsWith('#/repartidor')?<Repartidor/>:h.startsWith('#/admin')?<Admin/>:<Cliente/>);
window.addEventListener('hashchange',()=>location.reload());
