import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import cors from 'cors';

// โหลดตัวแปรแวดล้อมจากไฟล์ .env
dotenv.config();

const app = express();
const port = 8000;

// เปิดใช้งาน CORS เพื่อให้สามารถรับคำขอจากโดเมนอื่นได้
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// เชื่อมต่อฐานข้อมูล MongoDB โดยใช้ URI จากตัวแปรแวดล้อม
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// กำหนด Schema สำหรับสินค้า ซึ่งมีชื่อ คำอธิบาย ราคา และจำนวนในสต็อก
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  stock: { type: Number, required: true }
});

// กำหนด Schema สำหรับผู้ใช้ที่มีชื่อผู้ใช้ รหัสผ่าน และชื่อจริง
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true }
});

// กำหนด Schema สำหรับบันทึกประวัติการเบิกและเติมสินค้า โดยเก็บข้อมูลสินค้าที่เกี่ยวข้อง ผู้ใช้ และจำนวน
const stockHistorySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["add", "withdraw"], required: true },
  quantity: { type: Number, required: true },
  description: String,
  date: { type: Date, default: Date.now },
  billId: { type: String },
  location:{ type: String },
  total:{ type: Number },
  
});

const Product = mongoose.model("Product", productSchema);
const User = mongoose.model("User", userSchema);
const StockHistory = mongoose.model("StockHistory", stockHistorySchema);

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // ค้นหาผู้ใช้จากฐานข้อมูล
    const user = await User.findOne({ username });

    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    // ส่งข้อมูลผู้ใช้กลับมา รวมทั้ง _id และ username
    res.json({ 
      success: true, 
      user: { 
        _id: user._id, 
        username: user.username, 
        role: user.role 
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" });
  }
});

// ✅ API เก็บข้อมูลผู้ใช้
app.post("/api/users", async (req, res) => {
  try {
    const { username, password, uid, name } = req.body;
    if (!username || !password || !uid || !name) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const newUser = new User({ username, password, uid, name });
    await newUser.save();
    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ API ดึงข้อมูลผู้ใช้ทั้งหมด
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API สำหรับเพิ่มสินค้าใหม่
// ✅ เพิ่มสินค้าใหม่
app.post("/products", async (req, res) => {
  try {
    const { name, description, price, initialStock } = req.body;
    if (!name || !price || initialStock == null) {
      return res.status(400).json({ message: "Invalid request body" });
    }

    const newProduct = new Product({
      name,
      description: description || "",
      price,
      stock: initialStock
    });

    await newProduct.save();
    res.status(201).json({ message: "Product created successfully", product: newProduct });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ เพิ่มจำนวนสินค้าเก่า (Stock In)
app.put("/products/:id/stock/add", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, quantity, description } = req.body;

    // 🔴 เช็คว่า userId ถูกส่งมาหรือไม่
    if (!userId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "Invalid request body" });
    }

    // ✅ ค้นหาสินค้าโดยใช้ id
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // ✅ เพิ่มสินค้าเข้าสต็อก
    product.stock += quantity;
    await product.save();

    // ✅ บันทึกประวัติใน StockHistory
    const history = new StockHistory({
      productId: product._id,
      userId,  // ✅ เพิ่ม userId ตรงนี้
      type: "add",
      quantity,
      description: description || ""
    });
    await history.save();

    res.json({ message: "Stock added successfully", product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ เบิกสินค้า (Stock Out)
app.put("/products/:id/stock/withdraw", async (req, res) => {
  try {
    const { id } = req.params;
    let { userId, quantity, description, location, billId } = req.body;

    // 🔴 ตรวจสอบว่ามีข้อมูลที่จำเป็นครบหรือไม่
    if (!userId || !quantity || quantity <= 0 || !location) {
      return res.status(400).json({ message: "Invalid request body. Required: userId, quantity (>0), location" });
    }

    // ✅ ค้นหาสินค้าในฐานข้อมูล
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // ✅ ค้นหาผู้ใช้ในฐานข้อมูลเพื่อนำ `username` มาใช้
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔴 ตรวจสอบว่าสินค้ามีเพียงพอหรือไม่
    if (product.stock < quantity) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    // ✅ คำนวณ `total` (สมมติว่าสินค้ามีฟิลด์ `price`)
    const total = quantity * (product.price || 0);

    // ✅ ถ้าไม่มี billId ให้สร้างขึ้นอัตโนมัติ
    if (!billId) {
      billId = `BILL-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${uuidv4().slice(0, 6)}`;
    }

    // ✅ ลดจำนวนสต็อก
    product.stock -= quantity;
    await product.save();

    // ✅ บันทึกประวัติการเบิกสินค้าใน StockHistory
    const history = new StockHistory({
      productId: product._id,
      userId,
      username: user.username,  // ✅ เก็บ `username` ของผู้เบิก
      type: "withdraw",
      quantity,
      total,  // ✅ เก็บ `total` = quantity * price
      description: description || "",
      location,
      billId
    });
    await history.save();

    res.json({ message: "Stock withdrawn successfully", product, billId, total, username: user.username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ✅ ดึงข้อมูลสินค้าตาม ID
app.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ ดึงสินค้าทั้งหมด
app.get("/products", async (req, res) => {
  try {
    const products = await Product.find();
    if (products.length === 0) {
      return res.status(404).json({ message: "No products found" });
    }
    res.json({ products });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ ดึง Stock History ของสินค้า
app.get("/stock-history/withdraw", async (req, res) => { 
  try {
    // ดึงข้อมูลทั้งหมดที่ type เป็น "withdraw" พร้อม `username`, `total`, `location`, `billId`, และ `productName`
    const history = await StockHistory.find({ type: "withdraw" })
      .sort({ date: -1 })
      .populate("userId", "username")  // ดึง `username` จาก `User`
      .populate("productId", "name price")  // ดึง `name` และ `price` จาก `Product`
      .select("productId userId username quantity total location billId description date");

    // คำนวณ `total` และเพิ่ม `productName` สำหรับแต่ละรายการ
    const formattedHistory = history.map(item => ({
      _id: item._id,
      productId: item.productId?._id || null,
      productName: item.productId?.name || "Unknown",  // ✅ เพิ่มชื่อสินค้า
      userId: item.userId?._id || null,
      username: item.userId?.username || "Unknown",
      quantity: item.quantity,
      total: item.quantity * (item.productId?.price || 0),  // ✅ คำนวณราคารวม
      location: item.location || "Unknown",
      billId: item.billId || "N/A",
      description: item.description || "",
      date: item.date
    }));

    res.json({ history: formattedHistory });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




// เริ่มต้นเซิร์ฟเวอร์ Express และรอรับคำขอบนพอร์ตที่กำหนด
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
