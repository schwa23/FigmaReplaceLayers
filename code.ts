let uiOpen = false;
let sourceNode = null;
let _preserve = true;

async function setup() {
  _preserve = await figma.clientStorage.getAsync("preserveTransforms");

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
  let newSelection = [];
  let lastId = root.getPluginData("lastId");
  sourceNode = figma.getNodeById(lastId);
  if (sourceNode) {
    let newNode: SceneNode;
    const count = sel.length;
    sel.map(async function (node, index) {
      let scale = 1;
      if (node.type == "COMPONENT") {
        //TODO: Handle main components better

        let confirmWarning = await showConfirmDialog("Are you sure you want to replace a main component?");
        if (confirmWarning === false) return;

      }
      if (node.type === "INSTANCE") {
        //infer the scale from the instance's master
        scale = getScaleFromInstance(node as InstanceNode);
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

function getScaleFromInstance(node: InstanceNode) {
  let main = node.mainComponent;
  let mainHeight = main.height;
  let mainWidth = main.width;
  let height = node.height;
  let width = node.width;

  return Math.max(height / mainHeight, width / mainWidth);

}

async function updateThumbnail(id?: string) {
  let root = figma.root;
  if (!uiOpen) return;
  if (id) {
    sourceNode = figma.getNodeById(id);
    if (hasSize(sourceNode)) {
      let h = sourceNode.height;
      let w = sourceNode.width;

      let constraintType: "HEIGHT" | "WIDTH" | "SCALE" = "SCALE";
      //send a low res preview
      let exportBytes = await sourceNode.exportAsync({ format: "PNG", constraint: { type: constraintType, value: .25 } });
      figma.ui.postMessage({ type: "preview", "bytes": exportBytes, "name": sourceNode.name });
    }
  } else {

    let lastId = root.getPluginData("lastId");
    sourceNode = figma.getNodeById(lastId);
    if (hasSize(sourceNode)) {
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
  let lastId = figma.root.getPluginData("lastId");
  let sourceNode = figma.getNodeById(lastId);
  let badCount = 0;
  if (hasFills(sourceNode)) {

    figma.currentPage.selection.forEach(function (destNode: BaseNode) {
      if (!hasFills(destNode))
        return;
      badCount += replaceImageFills(sourceNode, destNode);
    });
  }

  if (badCount == 1) {
    figma.notify(`Couldn't replace images on one layer because it doesn't support fills.`)
  } else if (badCount > 1) {
    figma.notify(`Couldn't replace images on ${badCount} layers because they don't support fills.`)

  }
}

function replaceImageFills(node, destinationNode) {
  if (!hasFills(destinationNode)) {
    return 1;
  } else {


    let imageFills = [];
    //get all the images

    for (const paint of node.fills) {
      if (paint.type === 'IMAGE') {
        // Get the (encoded) bytes for this image.
        imageFills.push(paint)
        // TODO: Do something with the bytes!
      }
    }

    //TODO: figure out a better way to avoid typescript error 
    let destFills: any[] = <any>destinationNode.fills;
    if (destFills.length > 1) {
      for (const paint of destFills) {
        if (paint.type !== 'IMAGE') {
          //keep any non-image fills
          //push any other types of fills like gradients 
          imageFills.push(paint);
        }
      }
    }

    //replace the fills.
    destinationNode.fills = imageFills
    return 0;
  }
}

function setExternalImage(bytes: Uint8Array) {
  console.log('got an external image');
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
      setExternalImage(message.bytes);
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