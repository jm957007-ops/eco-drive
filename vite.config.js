import { defineConfig } from 'vite'; 
import { fileURLToPath } from 'node:url'; 
const raiz = (f) => fileURLToPath(new URL(f, import.meta.url)); 
export default defineConfig({ 
build: { 
rollupOptions: { 
input: { 
cliente: raiz('./index.html'), 
repartidor: raiz('./repartidor.html'), 
admin: raiz('./admin.html'), 
}, 
}, 
}, 
}); 
