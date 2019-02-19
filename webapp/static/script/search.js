$(document).ready(function(){

  // Slide on load
  if ($('#filters').length > 0) {
    $([document.documentElement, document.body]).animate({
      scrollTop: $('#filters').offset().top
    }, 1000);
  }

  // Home search
  if ($('#search').length > 0) {
    // On Load Show Lawyer expdertieses
    $('.translator-catogories').insertBefore('.search-button')
    $('.search-categories').hide();
    $('.translator-catogories').show();

    $('#id_category_id').change(function(){
      if ($('#id_category_id').val() == 1){
        $('.search-categories').hide();
        $('.search-categories').insertAfter('#search');
        $('.lawyer-catogories').insertBefore('.search-button');
        $('.lawyer-catogories').show();
      }
      if ($('#id_category_id').val() == 2){
        $('.search-categories').hide();
        $('.search-categories').insertAfter('#search');
        $('.finance-catogories').insertBefore('.search-button');
        $('.finance-catogories').show();
      }
      if ($('#id_category_id').val() == 3){
        $('.search-categories').hide();
        $('.search-categories').insertAfter('#search');
        $('.translator-catogories').insertBefore('.search-button');
        $('.translator-catogories').show();
      }

    });

  }

  $('#search').submit(function() {
    var district = $('#select-district-dd .selected span').html();
    $('#id_district').val(district);
  });

  // Only on searches
  if($('.search').length > 0){

    $('.filter-switch').click(function(){
      $('form').toggle();
      $(this).toggleClass('active');
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


    // Rating Slider
    if($('#rating-slider').length > 0){
      var slider5 = document.getElementById('rating-slider');

        // Set existing value if available
        rating_min = $('#id_rating_minimal').val();

        if(rating_min > 0){
        }else{
          rating_min = 1;
        }

        noUiSlider.create(slider5, {
         start: [rating_min],
         connect: true,
         step: 0.1,
         orientation: 'horizontal',
         range: {
           'min': 1,
           'max': 5
         },
         pips: {
            mode: 'count',
            values: 5,
            density: 10,
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

      slider5.noUiSlider.on('update', function( values, handle ) {
        if(handle == 0) {
          val = values[handle];
          $('#id_rating_minimal').val(val);
          $('#rating').html(val);
        }
      });
    }

    // Experience Slider
    if($('#experience-slider-minimal').length > 0){
      var slider4 = document.getElementById('experience-slider-minimal');

        // Set existing value if available
        exp_min = $('#id_experience_minimal').val();

        if(exp_min > 0){
        }else{
          exp_min = 1;
        }

        noUiSlider.create(slider4, {
         start: [exp_min],
         connect: true,
         step: 1,
         orientation: 'horizontal',
         range: {
           'min': 1,
           'max': 50
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

      slider4.noUiSlider.on('update', function( values, handle ) {
        if(handle == 0) {
          val = Math.round(values[handle]);
          $('#id_experience_minimal').val(val);
          $('#experience').html(val)
        }
      });
    }

    // Rates Slider
    if($('#rate-slider-maximal').length > 0){
      var slider3 = document.getElementById('rate-slider-maximal');

      // Set existing value if available
      hour_rate_max = $('#id_hour_rate_maximal').val();

      if(hour_rate_max > 0){
      }else{
        hour_rate_max = 5000;
      }

      noUiSlider.create(slider3, {

       start: [hour_rate_max],
       connect: true,
       step: 100,
       orientation: 'horizontal',
       range: {
         'min': 200,
         'max': 5000
       },
       pips: {
          mode: 'count',
          values: 10,
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

      slider3.noUiSlider.on('update', function( values, handle ) {
        if(handle == 0) {
          val = Math.round(values[handle]);
          $('#id_hour_rate_maximal').val(val);
          $('#rate').html(val);
        }
      });
    }
  }
});
