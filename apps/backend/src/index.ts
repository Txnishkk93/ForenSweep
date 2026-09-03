import express from 'express';
import { prismaClient } from "@repo/db";

const app = express();
const prisma = prismaClient;
app.use(express.json());

app.post('/signup', async (req, res) => {
    const { username, email, passwordHash } = req.body;

    const user = await prisma.user.create({
        data: {
            username,
            email,
            passwordHash,
        },
    });

    res.status(201).json(user);
});

app.listen(3000,()=>{
    console.log("Server is running on https://localHost:3000")
});
