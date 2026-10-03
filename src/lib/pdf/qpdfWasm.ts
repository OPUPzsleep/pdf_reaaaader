// Dirección del módulo qpdf.wasm dentro de la aplicación (Vite lo copia a dist/assets). Se importa aparte para que
// las pruebas en Node, que no pueden resolver «?url», indiquen la ruta del archivo a mano.
import wasm from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';

export default wasm;
