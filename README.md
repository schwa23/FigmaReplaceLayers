![Replace Layers](assets/header_image.png)

A Figma plugin to easily swap one layer with another. 

## How to Use
1. Select a layer in your Figma document.
2. Click **Set Source Layer**
3. Select another layer or layers that you want to replace
4. Click **Replace Layer(s)**
5. Keep Transforms: Check this box if the layers you're replacing are rotated or scaled, and you want to apply those transforms to the replacements. **Note** Scaling can only be determined if the layer you're replacing is an instance of a component.

### Other notes:
Originally I wanted to be able to use the clipboard as a the source for replacing a layer, but it's not possible in Figma. If you're using the Figma Desktop app, you can assign "Set Source Layer" to a keyboard shortcut as well.

If your source layer is a component, it will replace the target layer with an instance of that component.

The thumbnail that's generated when you set the source layer also acts as a quick export -- just drag it to your desktop to get a 2x resolution PNG of the source layer.

