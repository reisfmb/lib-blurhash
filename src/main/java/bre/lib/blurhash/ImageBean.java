package bre.lib.blurhash;

import com.google.common.io.ByteSource;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Base64;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/**
 * JS -> Java bridge for everything that needs real image codecs.
 *
 * The boundary is deliberate: Java does pixels <-> bytes, TypeScript does pixels <-> hash.
 * Only ByteSource crosses in (that is what XP hands us); int[] and String cross back, both
 * of which GraalJS presents as ordinary JS values.
 *
 * Everything below the two public methods takes plain JDK types, so it stays callable
 * without XP.
 */
public class ImageBean {

    public ImageBean() {
    }

    /**
     * A maxEdge-bounded thumbnail: {@code [width, height, r, g, b, a, r, g, b, a, ...]}.
     *
     * The two-int header exists because only this method knows the result's dimensions —
     * they fall out of the subsampling factor, and a caller recomputing them from the
     * aspect ratio gets a different answer by a rounding step. Returning them beside the
     * pixels keeps it to one bridge crossing and one source of truth.
     *
     * Flat r,g,b,a quadruples rather than packed ints: the encoder indexes components
     * directly, so unpacking in TS would cost a shift and two masks per pixel for nothing.
     * Alpha is always 255 — the codec reads a stride of 4 and ignores it.
     */
    public int[] rgbaThumbnail(ByteSource source, int maxEdge) throws Exception {
        BufferedImage thumb = thumbnail(source, maxEdge);
        if (thumb == null) {
            return new int[0];
        }

        int w = thumb.getWidth();
        int h = thumb.getHeight();
        int[] out = new int[2 + w * h * 4];
        out[0] = w;
        out[1] = h;

        int i = 2;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rgb = thumb.getRGB(x, y);
                out[i++] = (rgb >> 16) & 0xFF;
                out[i++] = (rgb >> 8) & 0xFF;
                out[i++] = rgb & 0xFF;
                out[i++] = 255;
            }
        }
        return out;
    }

    /**
     * The thumbnail as the payload of a PNG data URI.
     *
     * Kept from the M1 spike because the decoder needs the same PNG-writing path, driven by
     * pixels reconstructed from a hash rather than by the original image.
     */
    public String pngBase64(ByteSource source, int maxEdge) throws Exception {
        BufferedImage thumb = thumbnail(source, maxEdge);
        if (thumb == null) {
            return "";
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        if (!ImageIO.write(thumb, "png", bytes)) {
            return "";
        }
        return Base64.getEncoder().encodeToString(bytes.toByteArray());
    }

    /**
     * Reconstructed pixels -> PNG data URI payload. The decoder's half of the bridge.
     *
     * Takes RGBA at stride 4, matching what the codec emits, and ignores alpha: a BlurHash
     * placeholder is always opaque.
     */
    public String pngBase64Rgba(int[] rgba, int width, int height) throws Exception {
        if (rgba == null || width <= 0 || height <= 0 || rgba.length != width * height * 4) {
            return "";
        }

        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int y = 0, i = 0; y < height; y++) {
            for (int x = 0; x < width; x++, i += 4) {
                img.setRGB(x, y, (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
            }
        }

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        if (!ImageIO.write(img, "png", bytes)) {
            return "";
        }
        return Base64.getEncoder().encodeToString(bytes.toByteArray());
    }

    /** Decode subsampled, then scale to the exact target. Null when no reader accepts it. */
    private static BufferedImage thumbnail(ByteSource source, int maxEdge) throws Exception {
        try (InputStream in = source.openStream();
             ImageInputStream iis = ImageIO.createImageInputStream(in)) {

            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) {
                return null;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(iis, true, true);
                ImageReadParam param = reader.getDefaultReadParam();
                int factor = subsamplingFactor(reader.getWidth(0), reader.getHeight(0), maxEdge);
                param.setSourceSubsampling(factor, factor, 0, 0);
                return scaleTo(reader.read(0, param), maxEdge);
            } finally {
                reader.dispose();
            }
        }
    }

    /** Largest integer factor that still leaves the long edge at or above the target. */
    private static int subsamplingFactor(int srcW, int srcH, int maxEdge) {
        int longEdge = Math.max(srcW, srcH);
        return Math.max(1, longEdge / Math.max(1, maxEdge));
    }

    /**
     * Scale so the long edge is exactly maxEdge, aspect preserved.
     *
     * Always draws into TYPE_INT_RGB: the JPEG reader hands back TYPE_3BYTE_BGR, and
     * normalising here means getRGB is the only place byte order has to be understood.
     */
    private static BufferedImage scaleTo(BufferedImage src, int maxEdge) {
        int longEdge = Math.max(src.getWidth(), src.getHeight());
        double scale = (double) maxEdge / longEdge;

        int w = Math.max(1, (int) Math.round(src.getWidth() * scale));
        int h = Math.max(1, (int) Math.round(src.getHeight() * scale));

        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.drawImage(src, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return out;
    }
}
