# KTX2 Texture Conversion Guide

This guide explains how to create a KTX2-compressed version of the cat model for better performance.

## What is KTX2?

KTX2 (Khronos Texture 2.0) is a GPU-friendly texture compression format that:

- Reduces texture file sizes by 50-80%
- Provides faster GPU loading
- Supports various compression formats (Basis Universal, ASTC, etc.)
- Is widely supported in modern browsers

## Prerequisites

1. **Install glTF-Transform CLI**:

   ```bash
   npm install -g @gltf-transform/cli
   ```

2. **Or use online tools**:
   - https://gltf.report/ (online GLB optimizer)
   - https://github.com/KhronosGroup/glTF-Transform

## Method 1: Using glTF-Transform (Recommended)

### Step 1: Install glTF-Transform

```bash
npm install -g @gltf-transform/cli
```

### Step 2: Convert Textures to KTX2

```bash
gltf-transform ktx2 input.glb output.glb
```

For the cat model specifically:

```bash
gltf-transform ktx2 \
  public/models/cat/bicolor_cat.glb \
  public/models/cat/bicolor_cat_ktx2.glb
```

### Step 3: Verify the Output

Check the file size - it should be significantly smaller:

- Original: `bicolor_cat.glb` (check current size)
- KTX2: `bicolor_cat_ktx2.glb` (should be 50-70% smaller)

## Method 2: Using Basis Universal (Alternative)

If you want more control over compression:

### Step 1: Extract Textures from GLB

Use a tool like:

- Blender (export textures)
- glTF-Transform: `gltf-transform copy input.glb output.glb --textures folder/`

### Step 2: Convert Textures to KTX2

Use `toktx` (from KhronosGroup/KTX-Software):

```bash
# Install KTX-Software
# Download from: https://github.com/KhronosGroup/KTX-Software

# Convert texture
toktx --uastc --zcmp 9 texture.ktx2 texture.png
```

### Step 3: Embed Back into GLB

Use glTF-Transform or Blender to replace textures in the GLB.

## Method 3: Using Online Tools

1. Go to https://gltf.report/
2. Upload `bicolor_cat.glb`
3. Enable "KTX2" compression option
4. Download the optimized model
5. Save as `bicolor_cat_ktx2.glb` in `public/models/cat/`

## Verification

After conversion, verify:

1. **File size reduction**: Should be 50-70% smaller
2. **Texture quality**: Visual quality should be similar
3. **Browser support**: Test in Chrome/Edge (KTX2 support)

## Browser Support

KTX2 is supported in:

- Chrome 90+
- Edge 90+
- Firefox 90+ (with WebGL 2.0)
- Safari 15.4+ (limited support)

For older browsers, you may need fallback textures.

## Using the Component

Once you have `bicolor_cat_ktx2.glb`:

1. Place it in `public/models/cat/bicolor_cat_ktx2.glb`
2. The `CatKTX2` component is already created and ready to use
3. Import and use in your scene:

```jsx
import CatKTX2 from "./components/CatKTX2";

// In your component:
<CatKTX2 ref={catRef} />;
```

## Performance Benefits

Expected improvements:

- **File size**: 50-70% reduction
- **Load time**: 30-50% faster (depending on network)
- **GPU memory**: More efficient texture compression
- **Bandwidth**: Significant reduction for online deployment

## Troubleshooting

### KTX2 not loading?

- Check browser support (Chrome/Edge recommended)
- Verify file path is correct
- Check browser console for errors

### Quality issues?

- Try different compression levels
- Use UASTC for better quality (larger files)
- Use ETC1S for better compression (smaller files)

### File not found?

- Ensure file is in `public/models/cat/`
- Check file name matches exactly: `bicolor_cat_ktx2.glb`
- Verify file permissions

## Next Steps

1. Convert the cat model using one of the methods above
2. Test the `CatKTX2` component
3. Compare performance with original model
4. Consider converting other models if results are good
