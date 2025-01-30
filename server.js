import "dotenv/config"; // ✅ โหลด dotenv โดยใช้ ES Module
import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";

const app = express();
const port = 8000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ เชื่อมต่อ MongoDB Atlas
const MONGO_URI = "mongodb+srv://fa_hyn8:e50xQ2lNIHw1MGXf@cluster0.wowzr.mongodb.net/myDatabase?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

// ✅ สร้าง Schema สำหรับสินค้า
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  stock: { type: Number, required: true }
});

// ✅ สร้าง Schema สำหรับ Stock History
const stockHistorySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  type: { type: String, enum: ["add", "withdraw"], required: true },
  quantity: { type: Number, required: true },
  description: String,
  date: { type: Date, default: Date.now }
});

// ✅ สร้าง Models
const Product = mongoose.model("Product", productSchema);
const StockHistory = mongoose.model("StockHistory", stockHistorySchema);

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
    const { quantity, description } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: "Invalid request body" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.stock += quantity;
    await product.save();

    const history = new StockHistory({
      productId: product._id,
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
    const { quantity, description } = req.body;

    if (!quantity || quantity <= 0) {
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
app.get("/products/:id/stock-history", async (req, res) => {
  try {
    const { id } = req.params;
    const history = await StockHistory.find({ productId: id }).sort({ date: -1 });
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
