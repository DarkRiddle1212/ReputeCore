-- CreateTable
CREATE TABLE "TokenLaunch" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT,
    "symbol" TEXT,
    "creator" TEXT NOT NULL,
    "launchAt" TIMESTAMP(3) NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenLaunch_pkey" PRIMARY KEY ("id")
);
