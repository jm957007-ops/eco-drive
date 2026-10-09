import {Component} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
import Cliente from './Cliente';import Repartidor from './Repartidor';import Admin from './Admin';import Punto from './Punto';import Recibo from './Recibo';
class Fallo extends Component{
 state={e:null};
 static getDerivedStateFromError(e){return{e}}
 render(){return this.state.e?<div style={{padding:16}}><h3>Algo falló</h3>
  <pre style={{whiteSpace:'pre-wrap',fontSize:12}}>{String(this.state.e.stack||this.state.e)}</pre>
  <button onClick={()=>{try{localStorage.clear()}catch{}location.reload()}}>Borrar datos y reintentar</button></div>:this.props.children}
}
const h=location.hash,is=x=>h.startsWith('#/'+x);
createRoot(document.getElementById('root')).render(<Fallo>
 {is('repartidor')?<Repartidor/>:is('admin')?<Admin/>:is('punto')?<Punto/>:is('recibo')?<Recibo/>:<Cliente/>}</Fallo>);
window.addEventListener('hashchange',()=>location.reload());
