import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let response;
    let success = false;
    
    // Attempt BleepingComputer
    try {
      response = await fetch('https://www.bleepingcomputer.com/feed/', {
        next: { revalidate: 60 },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (response.ok) success = true;
    } catch (err) {
      console.error("Failed to fetch BleepingComputer feed:", err);
    }

    // Fallback to CISA if BleepingComputer failed
    if (!success) {
      try {
        response = await fetch('https://www.cisa.gov/cybersecurity-advisories/all.xml', {
          next: { revalidate: 60 },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        if (response.ok) success = true;
      } catch (err) {
        console.error("Failed to fetch CISA fallback feed:", err);
      }
    }

    if (!success || !response) {
      return NextResponse.json([
        "WARNING: Secure feeds unreachable. Monitoring local networks...",
        "ALERT: Elevated intrusion attempts detected globally.",
        "SITREP: Standard protocols active. Standing by..."
      ]);
    }

    const xmlText = await response.text();
    const headlines: string[] = [];

    // Parse items using regex
    const itemMatches = xmlText.match(/<item>[\s\S]*?<\/item>/g);
    if (itemMatches) {
      for (const item of itemMatches) {
        let title = '';
        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
        if (titleMatch) {
          title = titleMatch[1];
          // Strip CDATA wrapper if present
          if (title.startsWith('<![CDATA[')) {
            title = title.substring(9, title.length - 3);
          }
        }
        if (title) {
          title = title
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&apos;/g, "'");
          headlines.push(title.trim());
        }
        if (headlines.length >= 7) break;
      }
    }

    if (headlines.length === 0) {
      return NextResponse.json([
        "SITREP: No critical alerts broadcasted in last cycle.",
        "STATUS: Passive surveillance online. Network anomaly index 0.02"
      ]);
    }

    return NextResponse.json(headlines);
  } catch (error) {
    console.error("Error in SITREP route handler:", error);
    return NextResponse.json([
      "ERROR: SITREP terminal communication system offline.",
      "CRITICAL: Failed to load external intelligence feed."
    ], { status: 500 });
  }
}
