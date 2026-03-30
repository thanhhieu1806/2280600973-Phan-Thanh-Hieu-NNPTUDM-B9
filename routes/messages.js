var express = require("express");
var router = express.Router();

const messageModel = require("../schemas/messages");
const { checkLogin } = require('../utils/authHandler.js');
const multer = require('multer');
const path = require('path');

// Cấu hình upload file (đơn giản)
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const filename = Date.now() + "-" + Math.round(Math.random() * 1000000) + ext;
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });

// ==================== 1. LẤY TẤT CẢ TIN NHẮN GIỮA 2 NGƯỜI ====================
router.get("/:userID", checkLogin, async function (req, res) {
    try {
        const myId = req.userId;
        const friendId = req.params.userID;

        const messages = await messageModel.find({
            $or: [
                { from: myId, to: friendId },
                { from: friendId, to: myId }
            ]
        }).sort({ createdAt: 1 });   // sắp xếp theo thời gian cũ → mới

        res.send(messages);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});


// ==================== 2. GỬI TIN NHẮN (Text hoặc File) ====================
router.post("/", checkLogin, upload.single('file'), async function (req, res) {
    try {
        const myId = req.userId;
        const friendId = req.body.to;

        if (!friendId) {
            return res.status(400).send({ message: "Thiếu người nhận (to)" });
        }

        let type = "text";
        let content = req.body.text;

        // Nếu có file thì lưu file
        if (req.file) {
            type = "file";
            content = req.file.path;        // lưu đường dẫn file
        }

        if (!content) {
            return res.status(400).send({ message: "Phải có nội dung tin nhắn hoặc file" });
        }

        const newMessage = new messageModel({
            from: myId,
            to: friendId,
            messageContent: {
                type: type,
                text: content
            }
        });

        await newMessage.save();
        res.send(newMessage);

    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});


// ==================== 3. LẤY DANH SÁCH CUỘC TRÒ CHUYỆN (Tin nhắn cuối cùng) ====================
router.get("/", checkLogin, async function (req, res) {
    try {
        const myId = req.userId;

        const conversations = await messageModel.aggregate([
            {
                $match: {
                    $or: [{ from: myId }, { to: myId }]
                }
            },
            { $sort: { createdAt: -1 } },                    // mới nhất trước
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$from", myId] }, "$to", "$from"
                        ]
                    },
                    lastMessage: { $first: "$$ROOT" }       // lấy tin nhắn mới nhất
                }
            },
            { $sort: { "lastMessage.createdAt": -1 } }      // sắp xếp cuộc trò chuyện
        ]);

        res.send(conversations);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});

module.exports = router;