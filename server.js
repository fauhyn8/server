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
  date: { type: Date, default: Date.now }
});

const Product = mongoose.model("Product", productSchema);
const User = mongoose.model("User", userSchema);
const StockHistory = mongoose.model("StockHistory", stockHistorySchema);

// API สำหรับเพิ่มสินค้าใหม่
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

// API สำหรับเบิกสินค้าออกจากสต็อก
app.put("/products/:id/stock/withdraw", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, quantity, description } = req.body;

    if (!userId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "Invalid request body" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ message: "Insufficient stock" });
    }

    product.stock -= quantity;
    await product.save();

    const history = new StockHistory({
      productId: product._id,
      userId,
      type: "withdraw",
      quantity,
      description: description || ""
    });
    await history.save();

    res.json({ message: "Stock withdrawn successfully", product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API สำหรับดึงข้อมูลประวัติการเบิกสินค้า
app.get("/stock-history", async (req, res) => {
  try {
    const history = await StockHistory.find({ type: "withdraw" })
      .populate("productId", "name price")
      .populate("userId", "name username")
      .sort({ date: -1 });

    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// เริ่มต้นเซิร์ฟเวอร์ Express และรอรับคำขอบนพอร์ตที่กำหนด
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
