let uiOpen = false;
let sourceNode = null;
let _preserve = true;
let didSetup = false;
let _externalImage;

async function setup() {
  if (!didSetup) {
    _preserve = await figma.clientStorage.getAsync("preserveTransforms");
    didSetup = true;
  }
}

function setLayer() {
  //node
  let root = figma.root;
  let sel = figma.currentPage.selection;
  if (sel.length !== 1) {
    if (!uiOpen) figma.closePlugin("⚠️ You must select a single layer.")
    return;
  }
  let id = sel[0].id;
  updateThumbnail(id);
  root.setPluginData("lastId", id);
  if (!uiOpen) figma.closePlugin(`Set source to ${sel[0].name}`);
}

async function replaceLayers() {
  setup();
  let root = figma.root;
  let sel = figma.currentPage.selection;
  let hasSourceNode = true;
  const count = sel.length;

  let newSelection = [];
  let lastId = root.getPluginData("lastId");
  if (lastId == "_EXTERNAL_IMAGE_") {
    hasSourceNode = false;
    sourceNode = figma.createRectangle();
    replaceImageFills(null, sourceNode, _externalImage);
    sourceNode.name = _externalImage.filename;
    

  } else {
    sourceNode = figma.getNodeById(lastId);
  }
  if (sourceNode) {
    let newNode: SceneNode;

    sel.map(async function (node, index) {
      let scale = 1;
      if (node.type == "COMPONENT") {
        let confirmWarning = await showConfirmDialog("Are you sure you want to replace a main component?");
        if (confirmWarning === false) return;
      }
      if (node.type === "INSTANCE") {
        //grab the scale from the instance's master
        scale = node.scaleFactor;
      }

      if (sourceNode.type != "COMPONENT" && sourceNode.type != "DOCUMENT") {
        newNode = sourceNode.clone();
      } else if (sourceNode.type == "COMPONENT") {
        newNode = sourceNode.createInstance();
      }
      let parent = node.parent;
      let insertIndex = parent.children.indexOf(node);
      parent.insertChild(insertIndex, newNode);

      newNode.x = node.x
      newNode.y = node.y;
      newNode.name = sourceNode.name;
      if (_preserve) {
        newNode.rotation = node.rotation;
        newNode.rescale(scale);
      }
     if(!hasSourceNode) {
       //we're replacing a layer with the image 
       //dragged in or from the clipboard.
       //use the destination layer's size 
       console.log("Doesn't have a source node")
       newNode.resize(node.width, node.height);
     }
      newNode.layoutAlign = node.layoutAlign;
      newSelection.push(newNode);
      node.remove();
    })

    // console.log(sel);
    figma.currentPage.selection = newSelection;
    // console.log(figma.currentPage.selection);
    figma.notify(`Replaced ${count} layer(s) with ${sourceNode.name}`);
    if (!uiOpen) figma.closePlugin();
  } else {
    figma.notify("⚠️ Couldn't replace layers.\nThe source layer must exist in this document.");
    if (!uiOpen) figma.closePlugin();
  }
}


async function updateThumbnail(id?: string) {
  let root = figma.root;
  if (!uiOpen) return;
  if (id) {
    sourceNode = figma.getNodeById(id);
    if (hasSize(sourceNode)) {
      let h = sourceNode.height;
      let w = sourceNode.width;

      let constraintType: "HEIGHT" | "WIDTH" | "SCALE" = h > w ? "HEIGHT" : "WIDTH";
      //send a low res preview
      let exportBytes = await sourceNode.exportAsync({ format: "PNG", constraint: { type: constraintType, value: 114 } });
      figma.ui.postMessage({ type: "preview", "bytes": exportBytes, "name": sourceNode.name });
    }
  } else {

    let lastId = root.getPluginData("lastId");
    sourceNode = figma.getNodeById(lastId);

    if (sourceNode && hasSize(sourceNode)) {
      let h = sourceNode.height;
      let w = sourceNode.width;
      let constraintType: "HEIGHT" | "WIDTH" | "SCALE" = "SCALE";

      //send a low res preview
      let previewBytes = await sourceNode.exportAsync({ format: "PNG", constraint: { type: constraintType, value: .25 } })
      figma.ui.postMessage({ type: "preview", "bytes": previewBytes, "name": sourceNode.name })
    }

  }

}

async function getLargeImage() {
  if (!!!sourceNode) return;
  if (hasSize(sourceNode)) {
    let h = sourceNode.height;
    let w = sourceNode.width;
    let constraintType: "HEIGHT" | "WIDTH" | "SCALE" = "SCALE";
    let bytes = await sourceNode.exportAsync({ format: "PNG", constraint: { type: constraintType, value: 2 } });
    _externalImage = { bytes: bytes, name: sourceNode.name };
    figma.ui.postMessage({ type: "large_image", "bytes": bytes, "name": sourceNode.name });
  }
}

async function presentUI() {
  figma.showUI(__html__, { width: 150, height: 290 });
  updateThumbnail();
  figma.ui.show();
  await setup();
  updateState(_preserve);
}


function preserveTransforms(preserve: boolean) {
  figma.clientStorage.setAsync("preserveTransforms", preserve);
  _preserve = preserve;

}

function replaceFill() {
  console.log('replacing fill');
  let lastId = figma.root.getPluginData("lastId");
  let badCount = 0;
  if (lastId == "_EXTERNAL_IMAGE_") {
    figma.currentPage.selection.forEach(function (destNode: BaseNode) {
      if (!hasFills(destNode))
        return;
      badCount += replaceImageFills(null, destNode, _externalImage);
    });
  } else {

    let sourceNode = figma.getNodeById(lastId);

    if (hasFills(sourceNode)) {
      figma.currentPage.selection.forEach(function (destNode: BaseNode) {
        if (!hasFills(destNode)) {
          badCount += 1;
        } else {
          badCount += replaceImageFills(sourceNode, destNode, _externalImage);
        }
      });
    } 

  }


  if (badCount == 1) {
    figma.notify(`Couldn't replace images on one layer because it doesn't support fills.`)
  } else if (badCount > 1) {
    figma.notify(`Couldn't replace images on ${badCount} layers because they don't support fills.`)

  }
}

function replaceImageFills(node, destinationNode, imageObject?) {
  let imageFills = [];
  let imageBytes = imageObject ? imageObject.bytes : null;
  let newPaint;
  if (imageBytes) {
    newPaint = {
      type: "IMAGE",
      scaleMode: "FILL",
      imageHash: figma.createImage(imageBytes).hash
    }
  }

  // if we only have image bytes, go ahead and set the fills to the image
  if (node === null && imageBytes) {
    imageFills.push(newPaint as ImagePaint)

  } else {
    if (!hasFills(destinationNode)) {
      //can't set a paint on a layer that can't be filled
      return 1; 
    } else if(node.fills.length > 0) {
      //get all the images
      for (const paint of node.fills) {
        if (paint.type === 'IMAGE') {
          imageFills.push(paint)
        }
      }

    }
    if (imageFills.length === 0 && newPaint) {
      //if the source node has no fills, and we passed imagebytes, then use the image
      // as the fill
      imageFills.push(newPaint)
    }

    //here's where set the fills on the source layer
    //TODO: figure out a better way to avoid typescript error 
    let destFills: any[] = <any>destinationNode.fills;
    
    if (destFills.length > 0) {
      for (const paint of destFills) {
        if (paint.type !== 'IMAGE') {
          //keep any non-image fills
          //push any other types of fills like gradients 
          imageFills.push(paint);
        }
      }
    }

  }
  //replace the fills.
  destinationNode.fills = imageFills
  return 0;
}

function setExternalImage(message) {
  console.log('got an external image');
  _externalImage = message;

  figma.root.setPluginData("lastId", "_EXTERNAL_IMAGE_");

}

function copyImage() {
  debugger;
  // navigator.clipboard.writeText("foo")
}

figma.on("selectionchange", () => {
  // console.log(figma.currentPage.selection);
})

figma.ui.onmessage = (message) => {
  // console.log("got this from the UI", message)
  // console.log(message);


  switch (message.name) {
    case "getLargeImage":
      getLargeImage();
      break;
    case "setLayer":
      setLayer();
      break;
    case "replaceLayers":
      replaceLayers();
      break;
    case "replaceImageFill":

      replaceFill();
      break;
    case "preserveTransforms":
      preserveTransforms(message.preserveTransforms);
      break;
    case "setExternalImage":
      setExternalImage(message);
      break;

    default:
      break;
  }
}


function hasSize(node: BaseNode):
  node is FrameNode | ComponentNode | InstanceNode | BooleanOperationNode | InstanceNode | VectorNode | StarNode | EllipseNode | LineNode | RectangleNode | PolygonNode | TextNode {
  return node.type ===
    "FRAME" || node.type ===
    "GROUP" || node.type ===
    "COMPONENT" || node.type ===
    "INSTANCE" || node.type ===
    "BOOLEAN_OPERATION" || node.type ===
    "VECTOR" || node.type ===
    "STAR" || node.type ===
    "LINE" || node.type ===
    "ELLIPSE" || node.type ===
    "POLYGON" || node.type ===
    "RECTANGLE" || node.type ===
    "TEXT"
}

function hasFills(node: BaseNode):
  node is FrameNode | ComponentNode | InstanceNode | BooleanOperationNode | InstanceNode | VectorNode | StarNode | EllipseNode | LineNode | RectangleNode | PolygonNode | TextNode {
  return node.type ===
    "FRAME" || node.type ===
    "COMPONENT" || node.type ===
    "INSTANCE" || node.type ===
    "BOOLEAN_OPERATION" || node.type ===
    "VECTOR" || node.type ===
    "STAR" || node.type ===
    "LINE" || node.type ===
    "ELLIPSE" || node.type ===
    "POLYGON" || node.type ===
    "RECTANGLE" || node.type ===
    "TEXT"
}


// Make sure to close the plugin when you're done. Otherwise the plugin will
// keep running, which shows the cancel button at the bottom of the screen.
switch (figma.command) {

  case "setLayer":
    // uiOpen = false;
    uiOpen = true;
    presentUI();
    setLayer();
    break;
  case "replaceLayers":
    // uiOpen = false;
    uiOpen = true;
    presentUI();
    replaceLayers();
    break;
  case "presentUI":
    uiOpen = true;
    presentUI();
    break;
}

async function showConfirmDialog(message: String) {
  //show the iframe
  figma.showUI(__html__, { visible: false })
  // Send the message
  figma.ui.postMessage({ "type": "showConfirmDialog", "message": message })
  //wait for a response from the ui
  const confirmationResponse = await new Promise((resolve, reject) => {
    figma.ui.onmessage = value => resolve(value)
  })
  return confirmationResponse;
}

function updateState(preserveTransforms: boolean) {
  figma.ui.postMessage({ "type": "updateTransformCheckbox", "message": preserveTransforms })


}