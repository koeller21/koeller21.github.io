// (function(){
//     // function showWelcome(){

//     // }

//     // function showTerms(){

//     //     // Display overlay to accept terms cookie
//     //     const termsCookieOverlay = document.createElement("div");
//     //     termsCookieOverlay.id = "TermsOverlay";
//     //     const termsCookieOverlayContainer = document.createElement("div");
//     //     termsCookieOverlayContainer.id = "TermsContainer";
//     //     const termsCookieOverlayText = document.createElement("p");

//     //     termsCookieOverlayText.innerHTML = `
//     //     <h1> Terms </h1>
//     //     <p>
//     //     I hereby confirm that I understand that \
//     //     this tool must not influence my actual driving decisions and that I \
//     //     will not look at or be distracted by this Web-App while driving. \ 
//     //     In the event of an accident, I hereby waive all legal claims with respect to this tool. \ 
//     //     Furthermore, I understand that this tool is optimized for german road traffic only and can thus only be used in the Federal Republic of Germany. 
//     //     </p>
//     //     `;

//     //     const termsCookieOverlayButtonNo = document.createElement("button");
//     //     termsCookieOverlayButtonNo.id = "btnTermsNo";
//     //     termsCookieOverlayButtonNo.className = "btn";
//     //     termsCookieOverlayButtonNo.textContent = "I reject the terms";

//     //     const termsCookieOverlayButtonOk = document.createElement("button");
//     //     termsCookieOverlayButtonOk.id = "btnTermsOk";
//     //     termsCookieOverlayButtonOk.className = "btn";
//     //     termsCookieOverlayButtonOk.textContent = "I accept and understand";

//     //     termsCookieOverlayContainer.appendChild(termsCookieOverlayText);
//     //     termsCookieOverlayContainer.appendChild(termsCookieOverlayButtonNo);
//     //     termsCookieOverlayContainer.appendChild(termsCookieOverlayButtonOk);
//     //     termsCookieOverlay.appendChild(termsCookieOverlayContainer)
//     //     document.body.appendChild(termsCookieOverlay);

//     //     let btnHandler = document.getElementById("btnTermsNo");
//     //     btnHandler.addEventListener("click", handleTermsRejected);
//     //     btnHandler = document.getElementById("btnTermsOk");
//     //     btnHandler.addEventListener("click", handleTermsAccepted);

//     // }

//     // function handleTermsRejected(){
//     //     console.log("Terms rejected");
//     // }

//     // function handleTermsAccepted(){
//     //     console.log("Terms accepted");
//     //     document.body.removeChild(document.getElementById("TermsOverlay"));

//     // }

//     // console.log('page is fully loaded');

//     // // showWelcome();
//     // // showTerms();

//     // const CANVAS_SIZE = 280;
//     // const CANVAS_SCALE = 0.5;

//     // const canvas = document.getElementById("canvas");
//     // const ctx = canvas.getContext("2d");
//     // console.log(ctx)
//     // const imgData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
//     // console.log(imgData.data);
//     // const input = new onnx.Tensor(new Float32Array(imgData.data), "float32");

//     // async function x(input){
//     //     const sess = new onnx.InferenceSession()
//     //     await sess.loadModel('../other/onnx_model.onnx')
//     //     const outputMap = await sess.run([input])
//     // }
//     // x(input);


//     // async function test() {
//     //     const sess = new onnx.InferenceSession()
//     //     await sess.loadModel('../other/onnx_model.onnx')
//     //     const input = new onnx.Tensor([1,3,112,112], "float32");
//     //     const outputMap = await sess.run([input])
//     //     const outputTensor = outputMap.values().next().value
//     //     console.log(`Output tensor: ${outputTensor.data}`)
//     // }
//     // test();


//     async function getConnectedDevices(type) {
//         const devices = await navigator.mediaDevices.enumerateDevices();
//         return devices.filter(device => device.kind === type)
//     }

//     async function playVideoFromCamera() {
//         try {
//             const constraints = {'video': true, 'audio': true};
//             const stream = await navigator.mediaDevices.getUserMedia(constraints);
//             const videoElement = document.querySelector('video');
//             videoElement.srcObject = stream;
//             videoElement.muted = true;

//             const canvas = document.getElementById("canvas");
//             var ctx = canvas.getContext("2d");


//         } catch(error) {
//             console.error('Error opening video camera.', error);
//         }
//     }


//     window.onload = (function(){
//         let q = document.getElementById("jo");
//         console.log(q)

//         const videoCameras = getConnectedDevices('videoinput');
//         console.log('Cameras found:', videoCameras);

//         videoCameras.then(function(result) {
//             // you can access the result from the promise here
//             console.log(result)
//             q.innerText = result[0].label;
//         });
//         playVideoFromCamera();


//     });


// })();


let processor = {
    timerCallback: function() {
        if (this.video.paused || this.video.ended) {
            return;
        }
        this.computeFrame();
        let self = this;
        setTimeout(function () {
            self.timerCallback();
        }, 0);
    },
    
    doLoad: function() {
        this.video = document.getElementById("video");
        this.c1 = document.getElementById("c1");
        this.ctx1 = this.c1.getContext("2d");
        this.c2 = document.getElementById("c2");
        this.ctx2 = this.c2.getContext("2d");
        let self = this;
        this.video.addEventListener("play", function() {
            self.width = self.video.videoWidth;
            self.height = self.video.videoHeight;
            self.timerCallback();
        }, false);
    },
    
    computeFrame: function() {
        this.ctx1.drawImage(this.video, 0, 0, this.width, this.height);
        let frame = this.ctx1.getImageData(0, 0, this.width, this.height);
        // console.log(this.width);
        // console.log(this.height);
        // let frame_data_no_alpha = frame.data.filter(function(_, i) {
        //     return (i + 1) % 4;
        //   })
        
        // // console.log(frame_data_no_alpha);

        // let x = new Uint8ClampedArray(frame_data_no_alpha);
        // let y = new ImageData(x, this.width, this.height);
        // console.log(y);
        
        let l = frame.data.length / 4;
        
        // for (let i = 0; i < l; i++) {
        //     let r = frame.data[i * 4 + 0];
        //     let g = frame.data[i * 4 + 1];
        //     let b = frame.data[i * 4 + 2];
        //     if (g > 100 && r > 100 && b < 43)
        //         frame.data[i * 4 + 3] = 0;
        // // }
        // for(let i = 0; i < l; i++){
        //     console.log(i+(112*112)*4);
        // }
        

        
        this.ctx2.putImageData(frame, 0, 0);
        return;
    }
};

async function getConnectedDevices(type) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === type)
}

async function playVideoFromCamera() {
    try {
        const constraints = {'video': true, 'audio': true};
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const videoElement = document.querySelector('video');
        videoElement.srcObject = stream;
        videoElement.muted = true;
    } catch(error) {
        console.error('Error opening video camera.', error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    
    let q = document.getElementById("jo");
    console.log(q)
    
    const videoCameras = getConnectedDevices('videoinput');
    console.log('Cameras found:', videoCameras);
    
    videoCameras.then(function(result) {
        // you can access the result from the promise here
        console.log(result)
        q.innerText = result[0].label;
    });
    playVideoFromCamera();
    
    processor.doLoad();
});