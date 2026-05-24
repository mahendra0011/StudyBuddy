const { fetchWithTimeout } = require("./geminiService");

function getYouTubeVideoId(value = "") {
    const input = String(value).trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
        return input;
    }

    try {
        const url = new URL(input);

        if (url.hostname.includes("youtu.be")) {
            return url.pathname.split("/").filter(Boolean)[0] || "";
        }

        if (url.hostname.includes("youtube.com")) {
            const fromQuery = url.searchParams.get("v");
            if (fromQuery) {
                return fromQuery;
            }

            const parts = url.pathname.split("/").filter(Boolean);
            const markers = ["embed", "shorts", "live"];
            const marker = markers.find(item => parts.includes(item));

            if (marker) {
                return parts[parts.indexOf(marker) + 1] || "";
            }
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getYouTubeThumbnail(url) {
    const videoId = getYouTubeVideoId(url);
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";
}

function normalizeDuration(value = "") {
    const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

    if (!match) {
        return "";
    }

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const parts = [];

    if (hours) {
        parts.push(String(hours));
    }

    parts.push(String(minutes).padStart(hours ? 2 : 1, "0"));
    parts.push(String(seconds).padStart(2, "0"));

    return parts.join(":");
}

async function getYouTubeVideo(url) {
    const videoId = getYouTubeVideoId(url);

    if (!videoId) {
        const error = new Error("A valid YouTube video URL is required.");
        error.statusCode = 400;
        error.payload = { status: "BAD_REQUEST", message: error.message };
        throw error;
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    if (!process.env.YOUTUBE_API_KEY) {
        return {
            videoId,
            url: videoUrl,
            thumbnail: getYouTubeThumbnail(videoUrl),
            warning: "YOUTUBE_API_KEY is not configured on the server."
        };
    }

    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    apiUrl.searchParams.set("part", "snippet,contentDetails");
    apiUrl.searchParams.set("id", videoId);
    apiUrl.searchParams.set("key", process.env.YOUTUBE_API_KEY);

    const response = await fetchWithTimeout(apiUrl.toString());
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(data?.error?.message || `YouTube request failed with status ${response.status}`);
        error.statusCode = response.status;
        error.payload = {
            status: data?.error?.status || "YOUTUBE_ERROR",
            message: error.message
        };
        throw error;
    }

    const video = data?.items?.[0];

    if (!video) {
        const error = new Error("YouTube video was not found.");
        error.statusCode = 404;
        error.payload = { status: "NOT_FOUND", message: error.message };
        throw error;
    }

    return {
        videoId,
        url: videoUrl,
        title: video.snippet?.title || "",
        channelTitle: video.snippet?.channelTitle || "",
        description: video.snippet?.description || "",
        publishedAt: video.snippet?.publishedAt || "",
        duration: normalizeDuration(video.contentDetails?.duration || ""),
        thumbnail: getYouTubeThumbnail(videoUrl)
    };
}

module.exports = {
    getYouTubeThumbnail,
    getYouTubeVideo,
    getYouTubeVideoId
};
