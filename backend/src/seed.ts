import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { User, UserDocument } from './schemas/user.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types} from 'mongoose';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userModel = app.get<Model<UserDocument>>('UserModel');

  try {
    console.log('🌱 Starting database seeding...');

    // Create sample users
    const users = await createSampleUsers(userModel);
    console.log(`✅ Created ${users.length} sample users`);

    console.log('🎉 Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await app.close();
  }
}

async function createSampleUsers(userModel: Model<UserDocument>): Promise<User[]> {
  const sampleUsers = [
    {
      name: 'Test User',
      email: 'test@example.com',
      password: 'test123',
      walletAddress: null,
      paymentMethodVerified: false,
      role: 'user',
      kycStatus: 'approved',
      isActive: true,
    },
    {
      name: 'Alice Johnson',
      email: 'alice@example.com',
      password: 'password123',
      walletAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      paymentMethodVerified: true,
      role: 'user',
    },
    {
      name: 'Bob Smith',
      email: 'bob@example.com',
      password: 'password123',
      walletAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      paymentMethodVerified: true,
      role: 'user',
    },
    {
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      password: 'password123',
      walletAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      paymentMethodVerified: true,
      role: 'user',
    },
    {
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'admin123',
      walletAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      paymentMethodVerified: true,
      role: 'admin',
    },
  ];

  const createdUsers: User[] = [];

  for (const userData of sampleUsers) {
    try {
      const existingUser = await userModel.findOne({ email: userData.email }).exec();
      if (!existingUser) {
        const user = new userModel(userData);
        const savedUser = await user.save();
        createdUsers.push(savedUser);
      } else {
        createdUsers.push(existingUser);
      }
    } catch (error) {
      console.log(`User ${userData.email} might already exist, skipping...`);
    }
  }

  return createdUsers;
}

  

seed();
