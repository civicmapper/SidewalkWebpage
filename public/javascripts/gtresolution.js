$(document).ready(function () {

    //enable popovers
    $(function () {
        $('[data-toggle="popover"]').popover()
    });

    //map and map markers
    var map;
    var mapMarkers = [];
    var mapLabels = [];
    //array that stores information about each GSV
    var panoramaContainers = [];

    //current route
    var cluster_session_id;
    //all labels not yet dealt with
    var all_labels = [];
    //labels committed to ground truth
    var ground_truth_labels = [];
    //labels designated as not ground truth
    var eliminated_labels = [];
    //cluster IDs
    var cluster_id_list = [];

    //stores which cluster is being looked at currently
    var currentClusterIndex;
    var currentLabel;
    // currentCoordinates are formats for the label's lat lng position, used to focus map
    var currentCoordinates;

    //stores the next open view to display a label on
    var nextOpenView = 0;

    //labels to be investigated in low disagreement round
    var toInvestigate = [];

    //stores foremost label zIndex
    var maxZIndex = 200;
    //list of existing toggle buttons
    var initializedToggleButtons = [];

    //stores color information for each label type
    var colorMapping = {
        CurbRamp: {fillStyle: '#00DE26'},
        NoCurbRamp: {fillStyle: '#E92771'},
        Obstacle: {fillStyle: '#00A1CB'},
        Other: {fillStyle: '#B3B3B3'},
        Occlusion: {fillStyle: '#B3B3B3'},
        NoSidewalk: {fillStyle: '#B3B3B3'},
        SurfaceProblem: {fillStyle: '#F18D05'}
    };

    //stores maps label type string to its id in the label_type table
    var labelTypeMapping = {
        CurbRamp: 1,
        NoCurbRamp: 2,
        Obstacle: 3,
        Other: 5,
        Occlusion: 6,
        NoSidewalk: 7,
        SurfaceProblem: 4
    };

    //stores information for each of the status
    var statusInfo = {
        null: {
            size: new google.maps.Size(18, 18),
            path: "/ground_truth/gt_",
            markerOptions: {
                strokeColor: "#000000",
                strokeOpacity: 0.8,
                fillOpacity: 0.5,
                strokeWeight: 0.5,
                status: null,
                zIndex: 100}
        }, //not yet dealt with, no status
        "Filter": {
            size: new google.maps.Size(21, 21),
            path: "/ground_truth/gt_commit_",
            markerOptions: {
                strokeColor: "#ffe500",
                strokeOpacity: 1,
                fillOpacity: 0.8,
                strokeWeight: 4,
                status: "Ground_Truth",
                zIndex: 200
            }
        }, //filter labels are dealth with in low disgareement round
        "Ground_Truth": {
            size: new google.maps.Size(21, 21),
            path: "/ground_truth/gt_commit_",
            markerOptions: {
                strokeColor: "#ffe500",
                strokeOpacity: 1,
                fillOpacity: 0.8,
                strokeWeight: 4,
                status: "Ground_Truth",
                zIndex: 200
            }
        }, //labels in ground truth
        "No_Ground_Truth": {
            size: new google.maps.Size(18, 18),
            path: "/ground_truth/gt_exclude_",
            markerOptions: {
                strokeColor: "#757470",
                strokeWeight: 0.5,
                strokeOpacity: 0.5,
                status: "No_Ground_Truth",
                zIndex: 50,
                fillOpacity: 0.2
            }
        } //labels designated not in ground truth
    };


    //initialize all markers on the side map
    function initializeAllMapMarkers() {
        //array to store all markers to be shown
        var features = []
        //iterate through and add remaining labels
        for (var clusterId in all_labels) {
            for (j = 0; j < all_labels[clusterId].length; j++) {
                var lbl = all_labels[clusterId][j];
                features.push({
                    position: new google.maps.LatLng(lbl.lat, lbl.lng),
                    type: lbl.label_type,
                    meta: lbl,
                    status: null
                });
            }
        }
        //iterate through and add ground truth labels
        for (j = 0; j < ground_truth_labels.length; j++) {
            var lbl = ground_truth_labels[j];
            features.push({
                position: new google.maps.LatLng(lbl.lat, lbl.lng),
                type: lbl.label_type,
                meta: lbl,
                status: "Ground_Truth"
            });
        }
        //iterate through and add designated not ground truth labels
        for (j = 0; j < eliminated_labels.length; j++) {
            var lbl = eliminated_labels[j];
            features.push({
                position: new google.maps.LatLng(lbl.lat, lbl.lng),
                type: lbl.label_type,
                meta: lbl,
                status: "No_Ground_Truth"
            });
        }
        //itearate through labels still to be investigated
        for (j = 0; j < toInvestigate.length; j++) {
            var lbl = toInvestigate[j].label;
            features.push({
                position: new google.maps.LatLng(lbl.lat, lbl.lng),
                type: lbl.label_type,
                meta: lbl,
                status: "Filter"
            });
        }

        // Create markers for all labels pushed to features
        features.forEach(function (feature) {
            //create the marker
            var marker = new google.maps.Circle({
                id: "marker" + feature.meta.label_id,
                meta: feature.meta,
                status: feature.status,
                center: new google.maps.LatLng(feature.meta.lat, feature.meta.lng),
                radius: 0.5,
                clickabe: true,
                fillColor: colorMapping[feature.meta.label_type].fillStyle
            });
            //change styles if the label is already designated as ground truth or not ground truth
            marker.setOptions(statusInfo[feature.status].markerOptions);
            //create the associated label (to show V1, V2, etc.)
            var labeling = new google.maps.Marker({
                map: map,
                id: feature.meta.label_id,
                position: new google.maps.LatLng(feature.meta.lat, feature.meta.lng),
                draggable: false,
                label: {text: "", fontWeight: 'bold', fontSize: '12px'},
                icon: {url: "", labelOrigin: new google.maps.Point(2, 6), size: new google.maps.Size(5, 5)},
                opacity: 1,
                crossOnDrag: false,
                visible: false
            });
            //bind the marker and label
            marker.bindTo('center', labeling, 'position');
            //on marker mouse over
            marker.addListener('mouseover', function () {
                //test whether label is present within a view
                var pano = panoramaContainers.find(panoramaContainer => panoramaContainer.cluster_id === marker.meta.cluster_id && panoramaContainer.pano_id === marker.meta.pano_id);
                //if so, highlight that view with a border
                if (pano != null) {
                    pano.view.style.borderStyle = "solid";
                }
                //emphasize label on map by highlighting pink
                marker.setOptions({fillColor: '#ff38fb'});
            });
            //on marker mouse out
            marker.addListener('mouseout', function () {
                //test whether label is present within a view
                var pano = panoramaContainers.find(panoramaContainer => panoramaContainer.cluster_id === marker.meta.cluster_id && panoramaContainer.pano_id === marker.meta.pano_id);
                //if so, highlight that view with a border
                if (pano != null) {
                    pano.view.style.borderStyle = "hidden";
                }
                //deemphasize label by removing the pink highlight
                marker.setOptions({fillColor: colorMapping[marker.meta.label_type].fillStyle});
            });
            //add marker to map, add marker and label to storage arrays
            marker.setMap(map);
            mapMarkers.push(marker);
            mapLabels.push(labeling);
        });
    }//end of initializeAllMapMarkers

    //initialize the four GSV panoramas based on data from a specific label
    function initializePanoramas(label) {
        var panosToUpdate = panoramaContainers.map(panoramaContainer => panoramaContainer.view);
        for (var i = 0; i < panosToUpdate.length; i++) {
            //update all indicated panoramas with pano_id, zoom, pov
            panoramaContainers[i].gsv_panorama = new google.maps.StreetViewPanorama(panosToUpdate[i], {
                pano: label.pano_id,
                zoom: label.zoom,
                pov: {
                    heading: label.heading,
                    pitch: label.pitch
                },
                disableDefaultUI: true,
                clickToGo: false,
                zoomControl: true,
                scrollwheel: false
            });
            panoramaContainers[i].gsv_panorama.setOptions({visible: false});
        }
    }//end of initializePanoramas

    //choose the earliest of the open views (views not displaying a label)
    //if all full, choose the first view
    function calculateNextOpenPanorama() {
        for (var i = 0; i < panoramaContainers.length; i++) {
            if (panoramaContainers[i].labels.length === 0) {
                return i;
            }
        }
        return 0;
    }//end of calculateNextOpenPanorama

    //show a label in the panorama
    function showLabel(label, pano, status) {
        //set pano variables to match added label
        pano.cluster_id = label.cluster_id;
        pano.pano_id = label.pano_id;
        //update info bar bove panorama
        if (pano.info.innerHTML === "Empty") {
            if (status === "Filter") {
                pano.info.innerHTML = "<b>Cluster ID: </b>" + label.cluster_id + ' | <b>Toggle Visible: </b><a href="javascript:;" id="toggle-visible-' + label.pano_id + label.cluster_id + '"><span class="glyphicon glyphicon-eye-open" style="color:#000000; font-size:14px"></span></a>';
            } else {
                pano.info.innerHTML = "<b>Cluster ID: </b> " + label.cluster_id + ' | <b>Labels Shown: </b> <span class="labelCount">' + pano.labels.length + '</span> | <b>Toggle Visible: </b><a href="javascript:;" id="toggle-visible-' + label.pano_id + label.cluster_id + '"><span class="glyphicon glyphicon-eye-open" style="color:#000000; font-size:14px"></span></a>';
            }
        }
        //if this toggle button has already been initialized, do not re-initialize
        if (initializedToggleButtons.indexOf(label.pano_id + label.cluster_id) < 0) {
            initializedToggleButtons.push(label.pano_id + label.cluster_id);
            //Toggle visibility of label markers (hide and show)
            $(document).on("click", '#toggle-visible-' + label.pano_id + label.cluster_id, function () {
                if (pano.labelMarkers[0].getIcon() === null) {
                    //if hidden, show all labels in the GSV
                    for (var i = 0; i < pano.labelMarkers.length; i++) {
                        var marker = mapMarkers.find(mkr => mkr.meta.label_id === pano.labels[i].label_id);
                        if (marker != null) {
                            pano.labelMarkers[i].setIcon("assets/javascripts/SVLabel/img" + statusInfo[marker.status].path + pano.labels[i].label_type + ".png?size=200");
                        }
                        else {
                            pano.labelMarkers[i].setIcon("assets/javascripts/SVLabel/img" + statusInfo[null].path + pano.labels[i].label_type + ".png?size=200");
                        }
                    }
                } else {
                    //if showing, hide all labels in the GSV
                    for (var i = 0; i < pano.labelMarkers.length; i++) {
                        pano.labelMarkers[i].setIcon(null);
                    }
                }
            });
        }
        //draw label, return POV focused on that issue
        var pov = renderLabel(label, pano, status);
        //display the GSV number on the map label
        var markerLabel = mapLabels.find(mkr => mkr.id === label.label_id);
        markerLabel.setOptions({
            visible: true,
            label: {text: (pano.number).toString(), fontWeight: 'bold', fontSize: '12px'}
        });
        //update selected panorama with pano, pov, and zoom
        var toChange = pano.gsv_panorama;
        toChange.setPano(label.pano_id);
        toChange.setPov(pov);
        toChange.setZoom(3);
        //flash on top of GSV, prevent user from clicking during rendering
        $('#pano' + (pano.number) + '-holder').prepend(
            '<div class="loading" style="width:100%; height: 115%; z-index:5;position:absolute;background-color:rgba(255, 255, 255, 0.67)">' +
            '<p style="text-align:center;vertical-align:center;position:relative;top:50%;height:90%"></p>' +
            '</div>').children('div.loading').fadeOut('slow', function () {
            $(this).remove();
        });
        nextOpenView = calculateNextOpenPanorama();
    }//end of showLabel

    //draw a label in the GSV
    function renderLabel(label, pano, status) {
        // get label placement based on x/y
        var labelPosition = mapXYtoPov(label.sv_canvas_x, label.sv_canvas_y, label.canvas_width, label.canvas_height, label.zoom, label.heading, label.pitch);
        //create a marker for the label in the panorama
        var id = "label-id-" + label.label_id;
        var size = statusInfo[status].size;
        var label_marker = new PanoMarker({
            pano: pano.gsv_panorama,
            container: pano.view,
            position: {heading: labelPosition.heading, pitch: labelPosition.pitch},
            icon: "assets/javascripts/SVLabel/img" + statusInfo[status].path + label.label_type + ".png?size=200",
            id: id,
            size: size,
            optimized: false
        });
        //store marker
        pano.labelMarkers.push(label_marker);
        //add listeners to the marker
        var markerIndex = pano.labelMarkers.length - 1;
        //CLICK
        google.maps.event.addListener(pano.labelMarkers[markerIndex], 'click', function () {
            //bring label to the front
            maxZIndex++;
            pano.labelMarkers[markerIndex].setOptions({zIndex: maxZIndex});
            //hide all other popovers
            for (var i = 0; i < pano.labelMarkers.length; i++) {
                if (i != markerIndex) {
                    $('#' + pano.labelMarkers[i].getId()).popover('hide');
                }
            }
            //create and open popover for label
            createPopover(pano, label, status);
        });
        //CHANGE IN POV
        google.maps.event.addListener(pano.gsv_panorama, 'pov_changed', function () {
            // Popover follows marker when POV is changed
            createPopover(pano, label, status);
            $("#" + id).popover('hide');
        });
        //return POV focused on the placed marker
        return {heading: labelPosition.heading, pitch: labelPosition.pitch};
    }//end of renderLabel

    // Create popover for marker
    function createPopover(pano, data, status) {
        if (status === "Filter") {
            return;
        } //do not give second round labels popovers
        var labelIndex = pano.labels.findIndex(lbl => lbl.label_id === data.label_id);
        var markerElement = $("#label-id-" + data.label_id);
        //create popup
        markerElement.popover({
            placement: 'top',
            content: '<p style="text-align:center; margin-bottom:2px"><b>Labeler:</b>&nbsp;' + data.turker_id + ', <b>Severity:</b>&nbsp;' + data.severity + ', <b>Temporary:</b>&nbsp;' + data.temporary
            + '</p>' +
            'Ground Truth: <input type="button" id="commit' + data.label_id + '" style="margin-top:1px" value="Yes"></input>' +
            '<input type="button" id="noCommit' + data.label_id + '" style="margin-top:4px" value="No"></input>' +
            '<input type="button" id="sendToBack' + data.label_id + '" style="margin-top:4px; margin-left:8px" value="Send to Back"></input>', // 9eba9e
            html: true,
            delay: 100
        });

        //clicking yes for ground truth hides popover and calls yesGroundTruth
        $(document).on("click", '.popover #commit' + data.label_id, function () {
            $("#label-id-" + data.label_id).popover('hide');
            yesGroundTruth(data);
        });
        //clicking no for ground truth hides popover and calls noGroundTruth
        $(document).on("click", '.popover #noCommit' + data.label_id, function () {
            $("#label-id-" + data.label_id).popover('hide');
            noGroundTruth(data);
        });
        //clicking send to back calculates the minimum zIndex of the labels within the panorama, and sends the current label behind that
        $(document).on("click", '.popover #sendToBack' + data.label_id, function () {
            $("#label-id-" + data.label_id).popover('hide');
            var minZ = 1000;
            for (var j = 0; j < pano.labelMarkers.length; j++) {
                minZ = Math.min(minZ, pano.labelMarkers[j].getZIndex());
            }
            minZ--;
            pano.labelMarkers[labelIndex].setOptions({zIndex: minZ});
        });
    }//end of createPopover

    //update counters at bottom of page
    function updateCounters() {
        document.getElementById("gtCounter").innerHTML = "DESIGNATED GROUND TRUTH: " + ground_truth_labels.length;
        document.getElementById("notGtCounter").innerHTML = "DESIGNATED NOT GROUND TRUTH: " + eliminated_labels.length;
        var remaining = 0;
        for (var clusterId in all_labels) {
            remaining += all_labels[clusterId].length;
        }
        document.getElementById("remainingCounter").innerHTML = "REMAINING LABELS: " + remaining;
    }//end of updateCounters

    //place this commit in ground truth
    function yesGroundTruth(commit) {
        //locate panorama and label
        var labelIndex = -1, pano = -1;
        for (i = 0; i < panoramaContainers.length; i++) {
            if (panoramaContainers[i].cluster_id === commit.cluster_id && panoramaContainers[i].pano_id === commit.pano_id) {
                labelIndex = panoramaContainers[i].labels.findIndex(lbl => lbl.label_id === commit.label_id);
                pano = i;
                break;
            }
        }
        //update visuals
        panoramaContainers[pano].labelMarkers[labelIndex].setIcon("assets/javascripts/SVLabel/img/ground_truth/gt_commit_" + commit.label_type + ".png?size=200");
        panoramaContainers[pano].labelMarkers[labelIndex].setOptions({
            size: statusInfo["Ground_Truth"].size,
            className: "Ground_Truth"
        });
        var marker = mapMarkers.find(mkr => mkr.meta.label_id === commit.label_id);
        //locate label within structure of storage arrays
        var index;
        //if label was in not ground truth
        if (marker.status === "No_Ground_Truth") {
            index = eliminated_labels.findIndex(i => i.label_id === commit.label_id);
            eliminated_labels.splice(index, 1);
            ground_truth_labels.push(commit);
        }
        //if label was not yet dealt with
        else if (marker.status === null) {
            index = all_labels[commit.cluster_id].findIndex(i => i.label_id === commit.label_id);
            all_labels[commit.cluster_id].splice(index, 1);
            ground_truth_labels.push(commit);
        }
        //transfer label
        //update the label counts
        updateCounters();
        //style marker
        marker.setOptions(statusInfo["Ground_Truth"].markerOptions);
    }//end of yesGroundTruth

    //this commit will not go in ground truth
    function noGroundTruth(commit) {
        //locate panorama and label
        var labelIndex = -1, pano = -1;
        for (i = 0; i < panoramaContainers.length; i++) {
            if (panoramaContainers[i].cluster_id === commit.cluster_id && panoramaContainers[i].pano_id === commit.pano_id) {
                labelIndex = panoramaContainers[i].labels.findIndex(lbl => lbl.label_id === commit.label_id);
                pano = i;
                break;
            }
        }
        //update visuals
        panoramaContainers[pano].labelMarkers[labelIndex].setIcon("assets/javascripts/SVLabel/img/ground_truth/gt_exclude_" + commit.label_type + ".png?size=200");
        panoramaContainers[pano].labelMarkers[labelIndex].setOptions({
            size: statusInfo["No_Ground_Truth"].size,
            className: "No_Ground_Truth"
        });
        var marker = mapMarkers.find(mkr => mkr.meta.label_id === commit.label_id);
        //locate label within structure of storage arrays
        var index;
        //if label was in ground truth
        if (marker.status === "Ground_Truth") {
            index = ground_truth_labels.findIndex(i => i.label_id === commit.label_id);
            ground_truth_labels.splice(index, 1);
            eliminated_labels.push(commit);
        }
        //if label was not yet dealt with
        else if (marker.status === null) {
            index = all_labels[commit.cluster_id].findIndex(i => i.label_id === commit.label_id);
            all_labels[commit.cluster_id].splice(index, 1);
            eliminated_labels.push(commit);
        }
        //transfer label
        //update the label counts
        updateCounters();
        //style marker
        marker.setOptions(statusInfo["No_Ground_Truth"].markerOptions);
    }//end of noGroundTruth

    //clear a specific GSV
    function clearCanvas(index) {
        var panoramaContainer = panoramaContainers[index];
        //iterate through labels in the panorama
        for (i = 0; i < panoramaContainer.labelMarkers.length; i++) {
            var markerLabel = panoramaContainer.labelMarkers[i];
            var labelId = panoramaContainer.labels[i].label_id;
            //hide popover
            $('#' + markerLabel.getId()).popover('hide');
            //remove view number label from map marker
            var mLabel = mapLabels.find(mkr => mkr.id === labelId);
            if (mLabel != null) {
                mLabel.setOptions({visible: false});
            }
            //remove marker from GSV
            markerLabel.setMap(null);
        }
        //reset all varaibles associated with the GSV
        panoramaContainer.info.innerHTML = "Empty";
        panoramaContainer.view.style.borderStyle = "hidden";
        panoramaContainer.labels = [];
        panoramaContainer.labelMarkers = [];
        //recalculate next open view
        nextOpenView = calculateNextOpenPanorama();
        //clear all listeners
        google.maps.event.clearListeners(panoramaContainers[index].gsv_panorama, 'pov_changed');
    }//end of clearCanvas

    //add all labels in a cluster to the panoramas
    function addClusterToPanos(cluster) {
        //clear all Canvases
        for (var p = 0; p < 4; p++) {
            clearCanvas(p);
        }
        //for every label in the cluster
        for (var i = 0; i < cluster.length; i++) {
            //testWhether the cluster/pano combination is already up
            var toShow = cluster[i];
            var marker = mapMarkers.find(mkr => mkr.meta.label_id === toShow.label_id);
            var panoIndex = -1;
            for (var j = 0; j < panoramaContainers.length; j++) {
                if (panoramaContainers[j].cluster_id === marker.meta.cluster_id && panoramaContainers[j].pano_id === marker.meta.pano_id) {
                    panoIndex = j;
                }
            }
            // if the cluster/pano is already up
            if (panoIndex >= 0) {
                //add label and show label in that view
                panoramaContainers[panoIndex].labels.push(marker.meta);
                showLabel(marker.meta, panoramaContainers[panoIndex], marker.status);
            } else {
                //clear, add and show label in next view
                $('#clear' + (nextOpenView + 1)).trigger('click');
                panoramaContainers[nextOpenView].labels.push(marker.meta);
                showLabel(marker.meta, panoramaContainers[nextOpenView], marker.status);
            }
        }
        var counts = document.getElementsByClassName("labelCount");
        //focus views in between headings of labels
        for (var p = 0; p < 4; p++) {
            var pano = panoramaContainers[p];
            var count = pano.labels.length;
            var headingSum = 0.0;
            var pitchSum = 0.0;
            for (var l = 0; l < count; l++) {
                var hdng = mapXYtoPov(pano.labels[l].sv_canvas_x, pano.labels[l].sv_canvas_y, pano.labels[l].canvas_width, pano.labels[l].canvas_height, pano.labels[l].zoom, pano.labels[l].heading, pano.labels[l].pitch).heading;
                if (hdng < 0) {
                    hdng = 360.0 + hdng;
                }
                var ptch = mapXYtoPov(pano.labels[l].sv_canvas_x, pano.labels[l].sv_canvas_y, pano.labels[l].canvas_width, pano.labels[l].canvas_height, pano.labels[l].zoom, pano.labels[l].heading, pano.labels[l].pitch).pitch;
                headingSum += hdng;
                pitchSum += ptch;
            }
            if (count > 0) {
                pano.gsv_panorama.setPov({heading: headingSum / count, pitch: pitchSum / count});
                counts[p].innerHTML = panoramaContainers[p].labels.length;
                pano.gsv_panorama.setOptions({visible: true});
            }else{
                pano.gsv_panorama.setOptions({visible: false});
            }
        }
        nextOpenView = calculateNextOpenPanorama();
    }//end of addClusterToPanos

    //next and previous button functionality, direction -1 indicates previous, direction 1 indicates next
    function transitionDisagreement(direction) {
        //update currentClusterIndex
        if (direction > 0) {
            currentClusterIndex = (currentClusterIndex + direction) % cluster_id_list.length;
        } else {
            currentClusterIndex = (currentClusterIndex - 1);
            if (currentClusterIndex < 0) { currentClusterIndex = cluster_id_list.length - 1; }
        }
        var clusterId = cluster_id_list[currentClusterIndex];
        //if there are still unresolved labels in that cluster, display the cluster
        if (all_labels[clusterId].length > 0) {
            currentLabel = all_labels[clusterId][0];
            currentCoordinates = new google.maps.LatLng(currentLabel.lat, currentLabel.lng);
            refocusView(map);
            var toDisplay = all_labels[clusterId].slice();
            //include labels in the cluster that have already been dealt with
            for (j = 0; j < ground_truth_labels.length; j++) {
                if (ground_truth_labels[j].cluster_id === parseInt(clusterId)) {
                    toDisplay.unshift(ground_truth_labels[j]);
                }
            }
            for (j = 0; j < eliminated_labels.length; j++) {
                if (eliminated_labels[j].cluster_id === parseInt(clusterId)) {
                    toDisplay.unshift(eliminated_labels[j]);
                }
            }
            addClusterToPanos(toDisplay);
            map.setZoom(21);
        }
        //if there are no unresolved labels yet, alert user
        else if (document.getElementById("remainingCounter").innerHTML === "REMAINING LABELS: " + 0) {
            alert("All Labels Complete: Submission Allowed");
            document.getElementById("hiddenColumn").style.display = "inline-block";
        }
        //otherwise, go to next cluster
        else {
            transitionDisagreement(direction);
        }
    }//end of transitionDisagreement

    //focus view on current label
    function refocusView(map) {
        map.setZoom(21);
        map.setCenter(currentCoordinates);
    }//end refocusView


    //convert x and y coordinates to place panomarker in GSV
    function mapXYtoPov(canvas_x, canvas_y, canvas_width, canvas_height, zoom, heading, pitch) {
        function sgn(x) {
            return x >= 0 ? 1 : -1;
        }

        var PI = Math.PI;
        var cos = Math.cos;
        var sin = Math.sin;
        var tan = Math.tan;
        var sqrt = Math.sqrt;
        var atan2 = Math.atan2;
        var asin = Math.asin;
        var fov = PanoMarker.get3dFov(zoom) * PI / 180.0;
        var width = canvas_width;
        var height = canvas_height;
        var h0 = heading * PI / 180.0;
        var p0 = pitch * PI / 180.0;
        var f = 0.5 * width / tan(0.5 * fov);
        var x0 = f * cos(p0) * sin(h0);
        var y0 = f * cos(p0) * cos(h0);
        var z0 = f * sin(p0);
        var du = canvas_x - width / 2;
        var dv = height / 2 - canvas_y;
        var ux = sgn(cos(p0)) * cos(h0);
        var uy = -sgn(cos(p0)) * sin(h0);
        var uz = 0;
        var vx = -sin(p0) * sin(h0);
        var vy = -sin(p0) * cos(h0);
        var vz = cos(p0);
        var x = x0 + du * ux + dv * vx;
        var y = y0 + du * uy + dv * vy;
        var z = z0 + du * uz + dv * vz;
        var R = sqrt(x * x + y * y + z * z);
        var h = atan2(x, y);
        var p = asin(z / R);
        return {
            heading: h * 180.0 / PI,
            pitch: p * 180.0 / PI
        };
    }//end mapXYtoPov

    //automatic cluster filtering
    function filterClusters(data) {
        data = _.groupBy(data, "cluster_id");
         cluster_id_list = Object.keys(data);
        //iterate through and filter out clusters that are agreed upon
        for (var clusterId in data) {
            var cluster_data = data[clusterId];
            //if there are 3 labels in the cluster, keep looking
            if (cluster_data.length === 3) {
                //check if all labelers are different
                if (!((cluster_data[0].turker_id === cluster_data[1].turker_id) || (cluster_data[0].turker_id === cluster_data[2].turker_id) || (cluster_data[1].turker_id === cluster_data[2].turker_id))) {
                    //check if severities are all the same
                    var sameSeverity = !(cluster_data[0].severity === null && cluster_data[1].severity === null && cluster_data[2].severity === null) && (cluster_data[0].severity === cluster_data[1].severity && cluster_data[0].severity === cluster_data[2].severity);
                    var sameTemp = (cluster_data[0].temporary === cluster_data[1].temporary && cluster_data[0].temporary === cluster_data[2].temporary);
                    //calculate middle label
                    middle = chooseMiddle(cluster_data);
                    if (!(sameSeverity && sameTemp)) {
                        var label = cluster_data[middle];
                        var cluster = cluster_data.slice();
                        toInvestigate.push({data: cluster, label: label, sev: sameSeverity, temp: sameTemp});
                    }
                    //add middle label to ground_truth labels, other two to eliminated_labels
                    //map markers' style and status will update accordingly
                    ground_truth_labels.push(cluster_data[middle]);
                    cluster_data.splice(middle, 1);
                    for (var i = 0; i < cluster_data.length; i) {
                        eliminated_labels.push(cluster_data[i]);
                        cluster_data.splice(i, 1);
                    }
                }
            }
        }
        return data;
    }//end of filterClusters

    //investigate a low disagreement conflict, submit severity and temporary
    function resolveLowDisagreementConflict(data, index) {
        var label_data = data[index].label;
        var cluster_data = data[index].data;
        //set coordinates
        currentCoordinates = new google.maps.LatLng(label_data.lat, label_data.lng);
        map.setCenter(currentCoordinates);
        //show on panorama
        panoramaContainers[0].gsv_panorama = new google.maps.StreetViewPanorama(document.getElementById("panorama-1"), {
            pano: label_data.pano_id,
            pov: {
                heading: label_data.heading,
                pitch: label_data.pitch
            },
            disableDefaultUI: true,
            clickToGo: false,
            zoomControl: true
        });
        //display decided upon label
        clearCanvas(0);
        showLabel(label_data, panoramaContainers[0], "Filter");
        panoramaContainers[0].labels.push(label_data);
        //display information regarding the disagreement and provide option to change severity and temporary
        document.getElementById("panorama-3").innerHTML = '<br><table style="width:100%"><tr><th>Labeler</th><th id="sev_heading" style="text-align:center">Severity</th><th id="temp_heading" style="text-align:center">Temp</th><th style="text-align:center">Description</th></tr>' +
            '<tr><td>' + cluster_data[0].turker_id + '</td><td style="text-align:center">' + cluster_data[0].severity + '</td><td style="text-align:center">' + cluster_data[0].temporary + '</td>' + '</td><td style="text-align:center">' + cluster_data[0].description +
            '<tr><td>' + cluster_data[1].turker_id + '</td><td style="text-align:center">' + cluster_data[1].severity + '</td><td style="text-align:center">' + cluster_data[1].temporary + '</td>' + '</td><td style="text-align:center">' + cluster_data[1].description +
            '<tr><td>' + cluster_data[2].turker_id + '</td><td style="text-align:center">' + cluster_data[2].severity + '</td><td style="text-align:center">' + cluster_data[2].temporary + '</td>' + '</td><td style="text-align:center">' + cluster_data[2].description + '</table><br>' +
            'Severity: <select name="severity" id="severity"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select><br>' +
            'Temporary: <input type="checkbox" id ="temp"><br>' +
            '<button style="margin-top:4px" id="prelimCommit' + label_data.cluster_id + '">Submit Updates to Ground Truth</button>';

        //highlight the disagreement in the table
        if (!data[index].sev) {
            document.getElementById("sev_heading").style.backgroundColor = "#ff6d77";
        }
        if (!data[index].temp) {
            document.getElementById("temp_heading").style.backgroundColor = "#ff6d77";
        }

        //update label found in ground truth
        var toUpdate = ground_truth_labels.find(lbl => lbl.label_id === label_data.label_id);
        var next = index + 1;
        //button functionality
        $(document).on("click", '#prelimCommit' + toUpdate.cluster_id, function () {
            //update severity and temporary
            toUpdate.severity = parseInt(document.getElementById("severity").value);
            toUpdate.temporary = document.getElementById("temp").checked;
            updateCounters();
            //move to next low disagreement conflict
            if (next < data.length) {
                resolveLowDisagreementConflict(data, next);
            } else {
                startThirdRound();
            }
        });
    }//end of resolveLowDisagreementConflict

    //begin high disagreemnt round
    function startThirdRound(){
      //finished with low level conflicts
      cluster_id_list.length = Object.keys(all_labels).length;
      //intiailize mapbox layers and GSV panoramas
      currentClusterIndex = 0;
      var clusterId = cluster_id_list[currentClusterIndex];
      while (all_labels[clusterId].length <= 0) {
          currentClusterIndex++;
          clusterId = cluster_id_list[currentClusterIndex];
      }
      currentLabel = all_labels[clusterId][0];
      currentCoordinates = new google.maps.LatLng(currentLabel.lat, currentLabel.lng);
      map.setCenter(currentCoordinates);
      clearCanvas(0);
      document.getElementById("panorama-3").innerHTML = null;
      //initialize panoramas and show the first high disagreement cluster
      initializePanoramas(currentLabel);
      addClusterToPanos(all_labels[clusterId]);
      document.getElementById("round").innerHTML = "Ground Truth Resolution Tool - High Disagreement Round";
    }//end of startThirdRound

    //choose the middle of three points
    function chooseMiddle(points) {
        //calculate midpoint
        var avg_lat = (points[0].lat + points[1].lat + points[2].lat) / 3;
        var avg_lng = (points[0].lng + points[1].lng + points[2].lng) / 3;
        //choose the label closest to the midpoint
        var min = 1000000000000;
        var mid_label;
        for (i = 0; i < points.length; i++) {
            var distance = Math.sqrt(Math.pow(avg_lat - points[i].lat, 2) + Math.pow(avg_lng - points[i].lng, 2));
            if (distance < min) {
                min = distance;
                mid_label = i;
            }
        }
        return mid_label;
    }//end of chooseMiddle

    //initial onload
    function initialize() {
        //create map
        mapOptions = {
            center: new google.maps.LatLng(38.95965576171875, -77.07019805908203),
            mapTypeControl: false,
            mapTypeId: typeof google != "undefined" ? google.maps.MapTypeId.ROADMAP : null,
            maxZoom: 22,
            minZoom: 19,
            overviewMapControl: false,
            panControl: true,
            rotateControl: false,
            scaleControl: false,
            streetViewControl: false,
            zoomControl: true,
            zoom: 21
        };
        var mapCanvas = document.getElementById("groundtruth-map");
        map = typeof google != "undefined" ? new google.maps.Map(mapCanvas, mapOptions) : null;
        // Styling google map.
        mapStyleOptions = [
            {
                featureType: "all",
                stylers: [
                    {visibility: "off"}
                ]
            },
            {
                featureType: "road",
                stylers: [
                    {visibility: "on"}
                ]
            },
            {
                "elementType": "labels",
                "stylers": [
                    {"visibility": "off"}
                ]
            }
        ];
        if (map) map.setOptions({styles: mapStyleOptions});

        // Initialize panorama data
        for (var i = 0; i < 4; i++) {
            panoramaContainers.push({
                number: i + 1,  //number indicative of panorama
                gsv_panorama: null, // the StreetViewPanorama object for each view
                view: document.getElementsByClassName("gtpano")[i], // holder for the GSV panorama
                info: document.getElementsByClassName("labelstats")[i], // div above panorama holding label information
                labels: [], // metadata of label displayed in each panorama ({} if no label is displayed)
                labelMarkers: [], // the marker for the label in the panorama
                cluster_id: null,
                pano_id: null
            });
        }

        //map all button functionalities
        document.getElementById("gtnext").onclick = function () {
            transitionDisagreement(1);
        };
        document.getElementById("gtrefocus").onclick = function () {
            refocusView(map);
        };
        document.getElementById("gtprev").onclick = function () {
            transitionDisagreement(-1);
        };
        document.getElementById("clear1").onclick = function () {
            clearCanvas(0);
        };
        document.getElementById("clear2").onclick = function () {
            clearCanvas(1);
        };
        document.getElementById("clear3").onclick = function () {
            clearCanvas(2);
        };
        document.getElementById("clear4").onclick = function () {
            clearCanvas(3);
        };
        document.getElementById("gtSubmit").onclick = function () {
            async = true;
            var data = [];
            for (var i = 0; i < ground_truth_labels.length; i++) {
                var toSubmit = ground_truth_labels[i];
                toSubmit.label_type = labelTypeMapping[toSubmit.label_type];
                delete toSubmit.turker_id;
                toSubmit.description = toSubmit.description ? toSubmit.description : "";

                data.push(toSubmit);
            }
            $.ajax({
                async: true,
                contentType: 'application/json; charset=utf-8',
                url: "/gtresolution/results/" + cluster_session_id,
                type: 'post',
                data: JSON.stringify(data),
                dataType: 'json',
                success: function (result) {
                    console.log(result)
                },
                error: function (result) {
                    console.error(result);
                }
            });
        };
        //when cluster is submitted
        document.getElementById("submitClusterSessionId").onclick = function () {
            //execute query
            cluster_session_id = document.getElementById("clusterSessionId").value;
            console.log(cluster_session_id);
            // var test_labels = gtTestData;
            $.getJSON("/labelsForGtResolution/" + cluster_session_id, function (data) {
                all_labels = filterClusters(data[0]);
                console.log(all_labels);
                // all_labels = filterClusters(test_labels);
                //update counters
                updateCounters();
                document.getElementById("round").innerHTML = "Ground Truth Resolution Tool - Low Disagreement Round";
                //display all labels on map
                initializeAllMapMarkers();
                //deal with the first low disagreement conflict
                if(toInvestigate.length > 0){
                  resolveLowDisagreementConflict(toInvestigate, 0);
                }else{
                  startThirdRound();
                }
                //});
            });
            //reduce filler at bottom of page (styling purposes)
            document.getElementById("filler").style.minHeight = "5px";
        };//end of initialize
    }
    initialize();
});
