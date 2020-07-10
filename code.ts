let uiOpen = false;
let sourceNode = null;

function setLayer() {
  //node
  let sel = figma.currentPage.selection;
  if (sel.length !== 1) {
    if (!uiOpen) figma.closePlugin("⚠️ You must select a single layer.")
    return;
  }
  let id = sel[0].id;
  updateThumbnail(id);
  figma.clientStorage.setAsync("lastId", id).then(function () {
    if (!uiOpen) figma.closePlugin(`Set source to ${sel[0].name}`);
  })
}

function replaceLayers() {
  let sel = figma.currentPage.selection;
  let lastId = figma.clientStorage.getAsync("lastId").then(function (result) {
    sourceNode = figma.getNodeById(result);
    if (sourceNode) {
      let newNode: SceneNode;
      const count = sel.length;
      for (var i = 0; i < count; i++) {
        if (sel[i].type == "COMPONENT") {
          //TODO: Handle master components better
          // var warn = window.confirm("test?");
          // console.log(sel[i]);
          // console.log("We have a component");
          // figma.ui.postMessage({ type: "showConfirmDialog", "message": "Are you sure?" });
          // return;

        }
        if (sourceNode.type != "COMPONENT" && sourceNode.type != "DOCUMENT") {
          newNode = sourceNode.clone();

        } else if (sourceNode.type == "COMPONENT") {
          newNode = sourceNode.createInstance();

        }
        let parent = sel[i].parent;
        
        let index = parent.children.indexOf(sel[i]);
        parent.insertChild(index, newNode);
        newNode.x = sel[i].x
        newNode.y = sel[i].y;
        newNode.name = sourceNode.name;
        newNode.rotation = sel[i].rotation;
        newNode.layoutAlign = sel[i].layoutAlign;
        sel[i].remove();

      }
      figma.notify(`Replaced ${count} layer(s) with ${sourceNode.name}`);
      if (!uiOpen) figma.closePlugin();
    } else {
      figma.notify("⚠️ Couldn't replace layers.\nThe source layer must exist in this document.");
      if (!uiOpen) figma.closePlugin();
    }

  }, function (result) {
    figma.notify("⚠️ Couldn't replace layers.\nThe source layer must exist in this document.");
    if (!uiOpen) figma.closePlugin();
  });

}

function updateThumbnail(id?: string) {

  // console.log("Update thumbnail");
  if (!uiOpen) return;
  if (id) {
    sourceNode = figma.getNodeById(id);
    if (hasSize(sourceNode)) {
      let h = sourceNode.height;
      let w = sourceNode.width;
      let aspect = w / h;
      // console.log(aspect);
      let constraintType: "HEIGHT" | "WIDTH" | "SCALE" = "SCALE";
      //send a low res preview
      sourceNode.exportAsync({ format: "PNG", constraint: { type: constraintType, value: .25 } })
        .then(function (result) {
          figma.ui.postMessage({ type: "preview", "bytes": result, "aspect": aspect, "name": sourceNode.name });
        }
        )


    }
  } else {
    figma.clientStorage.getAsync("lastId").then(function (result) {
      sourceNode = figma.getNodeById(result);
      if (hasSize(sourceNode)) {
        let h = sourceNode.height;
        let w = sourceNode.width;
        let aspect = w / h;
        // console.log(aspect);

        let constraintType: "HEIGHT" | "WIDTH" | "SCALE" = "SCALE";

        //send a low res preview
        sourceNode.exportAsync({ format: "PNG", constraint: { type: constraintType, value: .25 } })
          .then(function (result) {

            // console.log(result);
            figma.ui.postMessage({ type: "preview", "bytes": result, "aspect": aspect, "name": sourceNode.name });
          }
          )
      };
    });
  }

}

function getLargeImage() {
  if(!!!sourceNode) return;
  if (hasSize(sourceNode)) {
    let h = sourceNode.height;
    let w = sourceNode.width;
    let aspect = w / h;
    // console.log(aspect);

    let constraintType: "HEIGHT" | "WIDTH" | "SCALE" = "SCALE";
    sourceNode.exportAsync({ format: "PNG", constraint: { type: constraintType, value: 2 } })
      .then(function (result) {

        // console.log(result);
        figma.ui.postMessage({ type: "large_image", "bytes": result, "aspect": aspect, "name": sourceNode.name });
      }
      )
  }
}

function presentUI() {
  figma.showUI(__html__, { width: 150, height: 230 });
  updateThumbnail();
  figma.ui.show();
}

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
