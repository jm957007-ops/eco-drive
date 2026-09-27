# Eco Drive · Entregas en moto o vehículo

Dos apps en un solo proyecto, conectadas a la misma base de datos:

- **Clientes:** `https://TU-SITIO.netlify.app/`
- **Repartidores:** `https://TU-SITIO.netlify.app/repartidor`

## 1. Firebase (10 minutos)

1. En console.firebase.google.com abre tu proyecto (puedes reusar el de siempre).
2. **Authentication > Método de acceso > Anónimo > Habilitar.** Sin esto la app no conecta.
3. **Firestore Database > Reglas:** copia SOLO los dos bloques `match` de `firestore.rules` dentro de tus reglas actuales. No borres las reglas de tus otras apps. Publica.
4. **Configuración del proyecto > Tus apps > Web:** copia el bloque `firebaseConfig` y pégalo en `src/firebase.js`.
5. **Authentication > Configuración > Dominios autorizados:** agrega tu dominio de Netlify cuando lo tengas.

Las colecciones se crean solas: `ecodrive_pedidos` y `ecodrive_repartidores`.

## 2. Probar en tu computadora

```bash
npm install
npm run dev
```

Abre `http://localhost:5173/` (cliente) y `http://localhost:5173/repartidor.html` (repartidor) en dos pestañas.

## 3. Subir a Netlify

1. Sube la carpeta a un repositorio de GitHub.
2. En Netlify: **Add new site > Import from GitHub** y elige el repo. El `netlify.toml` ya trae todo configurado.
3. Agrega el dominio de Netlify en Firebase (paso 1.5).

## Cómo funciona

1. El cliente elige recoger y entregar, moto o vehículo, y los datos de quien recibe.
2. El pedido aparece en vivo a los repartidores conectados de ese tipo, con sonido y vibración.
3. El repartidor acepta (o contraoferta si el cliente activó "Ofrece tu precio").
4. El cliente ve al repartidor moverse en el mapa y le manda a quien recibe un WhatsApp con el código y un enlace de rastreo.
5. El repartidor recoge, navega con Google Maps y cierra la entrega con el código de 4 dígitos.
6. El cliente califica y deja propina.

## Cambiar precios o comisión

En `src/comun.js`: `TIPOS` (banderazo, precio por km y por minuto, mínimo) y `COMISION` (0.10 = 10%).

## Antes de crecer

- El GPS del repartidor solo se envía con la app abierta en pantalla.
- Mapas, búsqueda de direcciones y rutas usan servicios gratuitos de OpenStreetMap, pensados para volumen bajo. Con muchos pedidos al día conviene pasar a un proveedor de pago.
- Los repartidores se registran solos. Para aprobarlos antes de que reciban envíos hay que agregar un panel de administrador.
- Los pagos con tarjeta requieren Mercado Pago.
