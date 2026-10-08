import {createRoot} from 'react-dom/client';
import './styles.css';
import Cliente from './Cliente';import Repartidor from './Repartidor';import Admin from './Admin';import Punto from './Punto';import Recibo from './Recibo';
const h=location.hash,is=x=>h.startsWith('#/'+x);
createRoot(document.getElementById('root')).render(
 is('repartidor')?<Repartidor/>:is('admin')?<Admin/>:is('punto')?<Punto/>:is('recibo')?<Recibo/>:<Cliente/>);
window.addEventListener('hashchange',()=>location.reload());
