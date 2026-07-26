import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupRobloxUser } from "@/lib/roblox";
import { enforceRateLimit } from "@/lib/rate-limit";
export async function POST(request:Request){try{const{username}=z.object({username:z.string().min(3).max(20)}).parse(await request.json());await enforceRateLimit(request,"roblox_lookup",username,20,600);return NextResponse.json({profile:await lookupRobloxUser(username)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Roblox lookup failed"},{status:400})}}
