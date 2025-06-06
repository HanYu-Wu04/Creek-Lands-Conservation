import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { authenticateAdmin } from "@/lib/auth";
import { getAuth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { userId } = getAuth(request);
  if (!userId || !(await authenticateAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Get pagination parameters from URL
    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get("page") || "1");
    const limit = Number.parseInt(searchParams.get("limit") || "8");
    const type = searchParams.get("type") || "template"; // template or completed

    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
    });

    // Determine the prefix based on the type
    const prefix = `waivers/${type === "template" ? "templates" : "completed"}/`;

    const command = new ListObjectsV2Command({
      Bucket: process.env.AWS_BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: 1000,
    });

    const response = await s3Client.send(command);

    // Filter for PDF files only
    const allPDFs =
      response.Contents?.filter((item) => {
        const key = item.Key?.toLowerCase() || "";
        return key.endsWith(".pdf");
      }).map((item) => {
        const fileName = item.Key?.split("/").pop() || "";
        return {
          key: item.Key || "",
          url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${item.Key}`,
          name: fileName,
          lastModified: item.LastModified?.toISOString(),
          size: item.Size,
        };
      }) || [];

    // Calculate pagination
    const totalPDFs = allPDFs.length;
    const totalPages = Math.ceil(totalPDFs / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    // Get the current page of PDFs
    const paginatedPDFs = allPDFs.slice(startIndex, endIndex);

    return NextResponse.json({
      pdfs: paginatedPDFs,
      page,
      limit,
      totalPDFs,
      totalPages,
    });
  } catch (error) {
    console.error("Error listing S3 PDFs:", error);
    return NextResponse.json({ error: "Failed to list PDFs from S3" }, { status: 500 });
  }
}
