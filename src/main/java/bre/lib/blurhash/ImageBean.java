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
     * The pixel array the BlurHash encoder consumes: a maxEdge-bounded thumbnail.
     *
     * Flat r,g,b triples rather than packed ints — the encoder wants components, and
     * unpacking in TS would cost a shift and two masks per pixel for nothing.
     */
    public int[] rgbPixels(ByteSource source, int maxEdge) throws Exception {
        BufferedImage thumb = thumbnail(source, maxEdge);
        if (thumb == null) {
            return new int[0];
        }

        int w = thumb.getWidth();
        int h = thumb.getHeight();
        int[] out = new int[w * h * 3];

        int i = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int rgb = thumb.getRGB(x, y);
                out[i++] = (rgb >> 16) & 0xFF;
                out[i++] = (rgb >> 8) & 0xFF;
                out[i++] = rgb & 0xFF;
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
