const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── CONEXIÓN ────────────────────────────────────────────────────────────────
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // ← Pon tu contraseña de MySQL aquí
    database: 'sweets',
    port: 3306
});

db.connect((err) => {
    if (err) {
        console.error('❌ Error al conectar a MySQL:', err.message);
        process.exit(1);
    }
    console.log('✅ Conectado a MySQL - Base de datos: sweets');
});

db.on('error', (err) => { console.error('MySQL error:', err); });

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

function getFechaLocal() {
    const ahora = new Date();
    const offset = -7; // UTC-7 verano Chihuahua. Cambia a -6 en invierno.
    const local = new Date(ahora.getTime() + offset * 60 * 60 * 1000);
    return local.toISOString().split('T')[0];
}

// Middleware: solo permite acceso a administradores
function soloAdmin(req, res, next) {
    const rol = req.headers['x-user-rol'];
    if (rol !== 'admin') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
    }
    next();
}

// ════════════════════════════════════════════════════════════════════════════
//  AUTH - LOGIN
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/login', async(req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ ok: false, mensaje: 'Completa todos los campos' });
    }
    try {
        const rows = await query(
            `SELECT e.idEmpleado, e.nombre, e.apPat, e.email, e.rol,
                    p.nombrePuesto
             FROM empleado e
             JOIN puestoempleado p ON e.idPuestoEmpleado = p.idPuestoEmpleado
             WHERE e.email = ? AND e.password = ?`, [email, password]
        );
        if (rows.length === 0) {
            return res.status(401).json({ ok: false, mensaje: 'Email o contraseña incorrectos' });
        }
        const emp = rows[0];
        res.json({
            ok: true,
            id: emp.idEmpleado,
            nombre: `${emp.nombre} ${emp.apPat}`,
            email: emp.email,
            rol: emp.rol,
            puesto: emp.nombrePuesto
        });
    } catch (err) {
        console.error('Login error:', err);
        if (err.code === 'ER_BAD_FIELD_ERROR') {
            return res.status(500).json({
                ok: false,
                mensaje: '⚠️ Ejecuta migracion_roles.sql en tu base de datos primero.'
            });
        }
        res.status(500).json({ ok: false, mensaje: 'Error del servidor' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  EMPLEADOS (solo admin)
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/empleados', soloAdmin, async(req, res) => {
    try {
        const rows = await query(`
            SELECT e.idEmpleado, e.nombre, e.apPat, e.apMat,
                   e.email, e.rol, p.nombrePuesto, p.salario, p.idPuestoEmpleado
            FROM empleado e
            JOIN puestoempleado p ON e.idPuestoEmpleado = p.idPuestoEmpleado
            ORDER BY e.nombre
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/empleados', soloAdmin, async(req, res) => {
    const { nombre, apPat, apMat, email, password, rol, idPuestoEmpleado } = req.body;
    if (!nombre || !apPat || !email || !password || !rol || !idPuestoEmpleado) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    try {
        const result = await query(
            `INSERT INTO empleado (nombre, apPat, apMat, email, password, rol, idPuestoEmpleado)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, [nombre, apPat, apMat || '', email, password, rol, idPuestoEmpleado]
        );
        const nuevo = await query(
            `SELECT e.*, p.nombrePuesto FROM empleado e
             JOIN puestoempleado p ON e.idPuestoEmpleado = p.idPuestoEmpleado
             WHERE e.idEmpleado = ?`, [result.insertId]
        );
        res.status(201).json(nuevo[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/empleados/:id', soloAdmin, async(req, res) => {
    const { nombre, apPat, apMat, email, password, rol, idPuestoEmpleado } = req.body;
    try {
        if (password && password.trim() !== '') {
            await query(
                `UPDATE empleado SET nombre=?, apPat=?, apMat=?, email=?, password=?, rol=?, idPuestoEmpleado=?
                 WHERE idEmpleado=?`, [nombre, apPat, apMat || '', email, password, rol, idPuestoEmpleado, req.params.id]
            );
        } else {
            await query(
                `UPDATE empleado SET nombre=?, apPat=?, apMat=?, email=?, rol=?, idPuestoEmpleado=?
                 WHERE idEmpleado=?`, [nombre, apPat, apMat || '', email, rol, idPuestoEmpleado, req.params.id]
            );
        }
        const updated = await query(
            `SELECT e.*, p.nombrePuesto FROM empleado e
             JOIN puestoempleado p ON e.idPuestoEmpleado = p.idPuestoEmpleado
             WHERE e.idEmpleado = ?`, [req.params.id]
        );
        res.json(updated[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/empleados/:id', soloAdmin, async(req, res) => {
    if (req.params.id == 1) {
        return res.status(400).json({ error: 'No puedes eliminar al administrador principal' });
    }
    try {
        await query('DELETE FROM empleado WHERE idEmpleado = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  PUESTOS
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/puestos', async(req, res) => {
    try {
        const rows = await query('SELECT * FROM puestoempleado ORDER BY nombrePuesto');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  DULCES
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/dulces', async(req, res) => {
    try {
        const rows = await query(`
            SELECT d.idDulces, d.nombre, d.precio, d.stock,
                   d.idTipoDulce, t.descripcionDulce
            FROM dulce d
            LEFT JOIN tipodulce t ON d.idTipoDulce = t.idTipoDulce
            ORDER BY d.nombre
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/dulces/:id', async(req, res) => {
    try {
        const rows = await query('SELECT * FROM dulce WHERE idDulces = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/dulces', soloAdmin, async(req, res) => {
    const { nombre, precio, stock, idTipoDulce } = req.body;
    if (!nombre || precio == null || stock == null || !idTipoDulce) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    try {
        const result = await query(
            'INSERT INTO dulce (nombre, precio, stock, idTipoDulce) VALUES (?, ?, ?, ?)', [nombre, precio, stock, idTipoDulce]
        );
        const nuevo = await query('SELECT * FROM dulce WHERE idDulces = ?', [result.insertId]);
        res.status(201).json(nuevo[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/dulces/:id', soloAdmin, async(req, res) => {
    const { nombre, precio, stock, idTipoDulce } = req.body;
    try {
        await query(
            'UPDATE dulce SET nombre=?, precio=?, stock=?, idTipoDulce=? WHERE idDulces=?', [nombre, precio, stock, idTipoDulce, req.params.id]
        );
        const updated = await query('SELECT * FROM dulce WHERE idDulces = ?', [req.params.id]);
        res.json(updated[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/dulces/:id', soloAdmin, async(req, res) => {
    try {
        await query('DELETE FROM dulce WHERE idDulces = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  TIPOS DE DULCE
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/tipos', async(req, res) => {
    try {
        const rows = await query('SELECT * FROM tipodulce ORDER BY descripcionDulce');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tipos', soloAdmin, async(req, res) => {
    const { descripcionDulce } = req.body;
    try {
        const result = await query(
            'INSERT INTO tipodulce (descripcionDulce) VALUES (?)', [descripcionDulce]
        );
        res.status(201).json({ idTipoDulce: result.insertId, descripcionDulce });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  VENTAS
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/ventas', async(req, res) => {
    try {
        const ventas = await query(`
            SELECT v.idVenta, v.fecha, v.total,
                   c.nombre AS cliente_nombre,
                   CONCAT(e.nombre, ' ', e.apPat) AS empleado_nombre,
                   e.idEmpleado
            FROM venta v
            LEFT JOIN cliente c ON v.idCliente = c.idCliente
            LEFT JOIN empleado e ON v.idEmpleado = e.idEmpleado
            ORDER BY v.fecha DESC, v.idVenta DESC
            LIMIT 200
        `);
        for (let v of ventas) {
            v.items = await query(`
                SELECT dv.cantidad, dv.costo, d.nombre AS dulce_nombre, d.precio
                FROM detalleventa dv
                JOIN dulce d ON dv.idDulce = d.idDulces
                WHERE dv.idVenta = ?
            `, [v.idVenta]);
        }
        res.json(ventas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Solo ventas de hoy (para cajeros)
app.get('/api/ventas/hoy', async(req, res) => {
    try {
        const hoy = getFechaLocal();
        const ventas = await query(`
            SELECT v.idVenta, v.fecha, v.total,
                   CONCAT(e.nombre, ' ', e.apPat) AS empleado_nombre,
                   e.idEmpleado
            FROM venta v
            LEFT JOIN empleado e ON v.idEmpleado = e.idEmpleado
            WHERE v.fecha = ?
            ORDER BY v.idVenta DESC
        `, [hoy]);
        for (let v of ventas) {
            v.items = await query(`
                SELECT dv.cantidad, dv.costo, d.nombre AS dulce_nombre
                FROM detalleventa dv
                JOIN dulce d ON dv.idDulce = d.idDulces
                WHERE dv.idVenta = ?
            `, [v.idVenta]);
        }
        res.json(ventas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ventas', async(req, res) => {
    const { items, idEmpleado } = req.body;
    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'El carrito está vacío' });
    }
    try {
        // Cliente genérico
        let clienteId = 1;
        const clientes = await query("SELECT idCliente FROM cliente WHERE nombre = 'Cliente General'");
        if (clientes.length === 0) {
            const r = await query("INSERT INTO cliente (nombre, email, telefono) VALUES ('Cliente General', '', '')");
            clienteId = r.insertId;
        } else {
            clienteId = clientes[0].idCliente;
        }

        // Empleado
        let empleadoId = idEmpleado || 1;
        const empCheck = await query('SELECT idEmpleado FROM empleado WHERE idEmpleado = ?', [empleadoId]);
        if (empCheck.length === 0) {
            const emps = await query('SELECT idEmpleado FROM empleado LIMIT 1');
            empleadoId = emps.length > 0 ? emps[0].idEmpleado : 1;
        }

        const total = items.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
        const fecha = getFechaLocal(); // ✅ Fecha local correcta

        const ventaResult = await query(
            'INSERT INTO venta (fecha, idEmpleado, idCliente, total) VALUES (?, ?, ?, ?)', [fecha, empleadoId, clienteId, total]
        );
        const idVenta = ventaResult.insertId;

        for (const item of items) {
            await query(
                'INSERT INTO detalleventa (cantidad, costo, idDulce, idVenta) VALUES (?, ?, ?, ?)', [item.cantidad, item.precio * item.cantidad, item.idDulce, idVenta]
            );
            await query(
                'UPDATE dulce SET stock = stock - ? WHERE idDulces = ?', [item.cantidad, item.idDulce]
            );
        }

        res.status(201).json({ ok: true, idVenta, total, fecha });

    } catch (err) {
        console.error('Error registrando venta:', err);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  MÁS VENDIDOS
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/masvendidos', async(req, res) => {
    try {
        const rows = await query(`
            SELECT d.idDulces, d.nombre, d.precio,
                   IFNULL(SUM(dv.cantidad), 0) AS ventas
            FROM dulce d
            LEFT JOIN detalleventa dv ON d.idDulces = dv.idDulce
            GROUP BY d.idDulces, d.nombre, d.precio
            ORDER BY ventas DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  CORTES DE CAJA (solo admin)
// ════════════════════════════════════════════════════════════════════════════
app.get('/api/cortes', soloAdmin, async(req, res) => {
    try {
        const rows = await query('SELECT * FROM corteventa ORDER BY fechaCorte DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/cortes', soloAdmin, async(req, res) => {
    try {
        const stats = await query(`
            SELECT IFNULL(SUM(dv.cantidad * dv.costo), 0) AS total,
                   COUNT(DISTINCT v.idVenta) AS numVentas
            FROM venta v
            JOIN detalleventa dv ON v.idVenta = dv.idVenta
            WHERE v.idCorteVenta IS NULL
        `);
        const { total, numVentas } = stats[0];
        const fecha = getFechaLocal(); // ✅ Fecha local correcta

        const result = await query(
            'INSERT INTO corteventa (fechaCorte, totalVentas, numVentas, createAt) VALUES (?, ?, ?, NOW())', [fecha, total, numVentas]
        );
        const idCorte = result.insertId;
        await query('UPDATE venta SET idCorteVenta = ? WHERE idCorteVenta IS NULL', [idCorte]);

        res.json({ ok: true, idCorte, total, numVentas, fecha });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── INICIAR ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🍬 Sweet Dreams en http://localhost:${PORT}`);
    console.log(`   Fecha local: ${getFechaLocal()}`);
    console.log(`\n   Usuarios:`);
    console.log(`   Admin  → admin@sweets.com  / admin123`);
    console.log(`   Cajero → maria@sweets.com  / cajero123\n`);
});