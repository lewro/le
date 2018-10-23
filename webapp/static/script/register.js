$(document).ready(function(){

  // Only on Register View
  if($('.register').length > 0){

    // On Enter
    $('input').keypress(function (e) {
      if (e.which == 13) {
        return false;
      }
    });

    // Tags
    $('.tag').click(function(){
      if ($(this).hasClass('active')){
        $(this).removeClass('active');
        // Update input
        current_experties1 = $('#id_expertise').val();
        expertise_to_remove1 = "," + $(this).attr("data-expertise-id");
        new_expertise1 = current_experties1.replace(expertise_to_remove1, "");
        $('#id_expertise').val(new_expertise1);

        // Removing 1s item with no ,
        current_experties2 = $('#id_expertise').val();
        expertise_to_remove2 = $(this).attr("data-expertise-id");
        new_expertise2 = current_experties2.replace(expertise_to_remove2, "");
        $('#id_expertise').val(new_expertise2);

      } else {
        $(this).addClass('active');
        current_experties = $('#id_expertise').val();

        if(current_experties.length > 0){
          new_expertise = current_experties + "," + $(this).attr("data-expertise-id");
        } else {
          new_expertise = $(this).attr("data-expertise-id");
        }

        $('#id_expertise').val(new_expertise);
      }
    });


    // Tagsa are stored as string, comma separated values, create array, itereated through
    // Hightlight the selected tags
    var expertieses_to_show = $('#id_expertise').val();
    var expertieses_array = new Array();
    var expertieses_array = expertieses_to_show.split(',');

    var arrayLength = expertieses_array.length;
    for (var i = 0; i < arrayLength; i++) {
      experties_integ = expertieses_array[i];
      var exp = $('body').find("[data-expertise-id='"+experties_integ+"']");
      $(exp).addClass('active');
    }

    // Register form on submit
    $('.register form').on("submit", function(){
      district = $('.dropdown-content .selected span').html();
      $('#id_district').val(district);
    });

    // Set Distric Value if already exist
    var district_value = $('#data-distric-value').attr('data-distric-value');
    $('#id_district_id').find('option').each(function() {
      if (parseInt($(this).attr('value')) == parseInt(district_value)) {
        $(this).attr('selected', true);
      } else {
        $(this).attr('selected', false);
      }
    });

    // Profession
    $('.profession').click(function() {

      $('.profession').removeClass('active');
      $(this).addClass('active');

      var profession_id = $(this).attr('data-id');
      $('#id_category_id').val(profession_id);
      $('.box-step.active').find('.box-stepper').focus().click();

      //Show expertiese for this category onlye
      $('.tag').hide();
      $("[data-category-id='"+profession_id+"']").show();

      if (profession_id == 3) {
        $('#hour_rate_label').hide()
        $('#normopage_rate_label').show()
      } else {
        $('#hour_rate_label').show()
        $('#normopage_rate_label').hide()
      }

      return false;
    });

    $('.box-stepper').click(function(){

      // Boxes
      var active_box = $('.box-step.active');
      $('.box-step').removeClass('active');
      $(active_box).next().addClass('active');

      // Steppers
      var active_step = $('.step.active');
      $('.step').removeClass('active');
      $(active_step).next().addClass('active');
      return false;
    });

    $('.box-stepper-back').click(function(){

      // Boxes
      var active_box = $('.box-step.active');
      $('.box-step').removeClass('active');
      $(active_box).prev().addClass('active');

      // Steppers
      var active_step = $('.step.active');
      $('.step').removeClass('active');
      $(active_step).prev().addClass('active');

      return false;
    });

    $('.step').click(function(){

      if ($('#step_1').hasClass('active')) {
        // User needs to chose profession, this step can't be skipped
      } else {
        // Boxes
        var box_id = $(this).attr('id');
        $('.box-step').removeClass('active');
        var new_box = $('body').find("[data-id='"+box_id+"']");
        $(new_box).addClass('active');

        // Steppers
        $('.step').removeClass('active');
        $(this).addClass('active');

      }
      return false;
    });

    // Address to Google Map
    $('input').blur(function(){
      street       = $('#id_street').val();
      street_no    = $('#id_street_number').val();
      city         = $('#id_city').val();
      zip          = $('#id_zipcode').val();

      $('#pac-input').val(street + " " + street_no);
    });

    $('#find_location').click(function(){
      $('#pac-input').focus().click();
      return false;
    });

    // Experience Slider
    if($('#experience-slider').length > 0){
      var slider = document.getElementById('experience-slider');

        // Set existing value if available
        experience = $('#id_experience').val();

        if(experience > 0){
        }else{
          experience = 1;
        }

        noUiSlider.create(slider, {
         start: [experience],
         connect: true,
         step: 1,
         orientation: 'horizontal',
         range: {
           'min': 0,
           'max': 50
         },
          pips: {
            mode: 'count',
            values: 5,
            density: 5,
            stepped: true
          },
          format: {
            to: function ( value ) {
              return Math.floor(value);
            },
            from: function ( value ) {
              return Math.floor(value);
           }
         }
      });

      experience = document.getElementById('id_experience');

      slider.noUiSlider.on('update', function( values, handle ) {
        val = Math.round(values[handle]);
        $('#experience').html(val);
        experience.value = val;
      });
    }


    // Rates Slider
    if($('#rate-slider').length > 0){
      var slider2 = document.getElementById('rate-slider');

        // Set existing value if available
        rate_min = $('#id_hour_rate_from').val();
        rate_max = $('#id_hour_rate_to').val();

        if(rate_min > 0){
        }else{
          rate_min = 500;
        }

        if(rate_max > 0){
        }else{
          rate_max = 1500;
        }

        noUiSlider.create(slider2, {
         start: [rate_min, rate_max],
         connect: true,
         step: 100,
         orientation: 'horizontal',
         range: {
           'min': 200,
           'max': 5000
         },
          pips: {
            mode: 'count',
            values: 6,
            density: 5,
            stepped: true
          },
          format: {
            to: function ( value ) {
              return Math.floor(value);
            },
            from: function ( value ) {
              return Math.floor(value);
           }
         }
      });

      rate_from            = document.getElementById('id_hour_rate_from');
      rate_to              = document.getElementById('id_hour_rate_to');

      slider2.noUiSlider.on('update', function( values, handle ) {
        if(handle == 0) {
          val = Math.round(values[handle]);
          rate_from.value = val;
          $('#rate_from').html(val);

        } else {
          val = Math.round(values[handle]);
          rate_to.value = val;
          $('#rate_to').html(val);
        }
      });
    }

    // Set category id if already exists
    // Category_id
    var selectedCategoryid  = $('#id_category_id').val();
    var categoryBox         = $(".box-step.active").find("[data-id='"+selectedCategoryid+"']");
    $(categoryBox).addClass('active');

    if (selectedCategoryid > 0){
      $('.tag').hide();
      $("[data-category-id='"+selectedCategoryid+"']").show();
    }

    if (selectedCategoryid == 3) {
      $('#hour_rate_label').hide()
      $('#normopage_rate_label').show()
    } else {
      $('#hour_rate_label').show()
      $('#normopage_rate_label').hide()
    }

  }
});
